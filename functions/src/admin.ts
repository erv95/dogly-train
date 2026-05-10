import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

/**
 * Delete all files under a Storage prefix.
 * Errors are caught and logged — a failed Storage cleanup must not
 * block Firestore/Auth deletion (best-effort GDPR compliance).
 */
async function deleteStorageFolder(prefix: string): Promise<void> {
  try {
    const bucket = admin.storage().bucket();
    const [files] = await bucket.getFiles({ prefix });
    if (files.length === 0) return;
    await Promise.allSettled(files.map((f) => f.delete()));
    functions.logger.info(`Deleted ${files.length} Storage file(s) under ${prefix}`);
  } catch (err) {
    functions.logger.warn(`Storage cleanup failed for prefix ${prefix}`, err);
  }
}

/**
 * Scheduled function: check and expire boosts.
 * Runs every hour. Clears boostedUntil for expired boosts.
 */
export const checkBoostExpiration = functions.pubsub
  .schedule("every 1 hours")
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();

    // Note: a Firestore range query (<=) on a Timestamp field would also match
    // documents where the field is null (null sorts before all values). To avoid
    // touching every never-boosted user every hour we skip already-cleared docs
    // in JS after the read.
    const expiredSnapshot = await db
      .collection("users")
      .where("role", "in", ["trainer", "caretaker"])
      .where("boostedUntil", "<=", now)
      .get();

    const expiredDocs = expiredSnapshot.docs.filter((d) => d.data().boostedUntil != null);
    if (expiredDocs.length === 0) {
      functions.logger.info("No expired boosts found");
      return;
    }

    const batch = db.batch();
    expiredDocs.forEach((doc) => {
      batch.update(doc.ref, {
        boostedUntil: null,
        updatedAt: admin.firestore.Timestamp.now(),
      });
    });

    await batch.commit();
    functions.logger.info(`Cleared ${expiredDocs.length} expired boosts`);
  });

/**
 * GDPR: Delete user account and ALL associated data.
 * Deletes: Firestore documents, Firebase Auth account, Storage files.
 * Order: data first, Auth account last (token stays valid during cleanup).
 */
export const deleteUserAccount = functions.https.onRequest(async (req, res) => {
  // CORS — restricted to app origin
  const allowedOrigin = process.env.APP_ORIGIN ?? "https://dogly-train.web.app";
  res.set("Access-Control-Allow-Origin", allowedOrigin);
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Verify Firebase ID token
  const authHeader = req.headers.authorization ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  let verifiedUid: string;
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    verifiedUid = decoded.uid;
  } catch {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  const { userId } = req.body;
  if (!userId) {
    res.status(400).json({ error: "Missing userId" });
    return;
  }

  // Users can only delete their own account
  if (verifiedUid !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    // Verify user exists in Firestore before starting deletion
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      // Already deleted — still clean up Auth in case it lingered
      try { await admin.auth().deleteUser(userId); } catch {}
      res.status(200).json({ success: true });
      return;
    }

    // ── Firestore cleanup ────────────────────────────────────────────────────
    // All steps run before deleting the user doc/Auth so the token stays valid.

    // 1. Dogs + dog stats
    const [dogsSnapshot, dogStatsSnapshot] = await Promise.all([
      db.collection("dogs").where("ownerId", "==", userId).get(),
      db.collection("dog_stats").where("ownerId", "==", userId).get(),
    ]);
    const batch1 = db.batch();
    dogsSnapshot.forEach((d) => batch1.delete(d.ref));
    dogStatsSnapshot.forEach((d) => batch1.delete(d.ref));
    if (!dogsSnapshot.empty || !dogStatsSnapshot.empty) await batch1.commit();

    // 2. Reviews (given and received)
    const [reviewsGiven, reviewsReceived] = await Promise.all([
      db.collection("reviews").where("fromUserId", "==", userId).get(),
      db.collection("reviews").where("toUserId", "==", userId).get(),
    ]);
    const batch2 = db.batch();
    reviewsGiven.forEach((d) => batch2.delete(d.ref));
    reviewsReceived.forEach((d) => batch2.delete(d.ref));
    if (!reviewsGiven.empty || !reviewsReceived.empty) await batch2.commit();

    // 3. Coin transactions + course progress
    const [txSnapshot, progressSnapshot] = await Promise.all([
      db.collection("coin_transactions").where("userId", "==", userId).get(),
      db.collection("course_progress").where("userId", "==", userId).get(),
    ]);
    const batch3 = db.batch();
    txSnapshot.forEach((d) => batch3.delete(d.ref));
    progressSnapshot.forEach((d) => batch3.delete(d.ref));
    if (!txSnapshot.empty || !progressSnapshot.empty) await batch3.commit();

    // 3b. Walk logs + health reminders (GDPR right-to-erasure)
    const [walksSnapshot, remindersSnapshot] = await Promise.all([
      db.collection("dog_walks").where("userId", "==", userId).get(),
      db.collection("dog_reminders").where("userId", "==", userId).get(),
    ]);
    const batch3b = db.batch();
    walksSnapshot.forEach((d) => batch3b.delete(d.ref));
    remindersSnapshot.forEach((d) => batch3b.delete(d.ref));
    if (!walksSnapshot.empty || !remindersSnapshot.empty) await batch3b.commit();

    // 4. Anonymize participant info in shared chats
    const chatsSnapshot = await db
      .collection("chats")
      .where("participants", "array-contains", userId)
      .get();
    const batch4 = db.batch();
    chatsSnapshot.forEach((chatDoc) => {
      const data = chatDoc.data();
      batch4.update(chatDoc.ref, {
        participantNames: { ...data.participantNames, [userId]: "Deleted User" },
        participantPhotos: { ...data.participantPhotos, [userId]: null },
      });
    });
    if (!chatsSnapshot.empty) await batch4.commit();

    // ── Storage cleanup (GDPR: remove all user files) ────────────────────────
    // Run in parallel — failures are logged but do not block account deletion.
    await Promise.allSettled([
      deleteStorageFolder(`users/${userId}/`),   // avatar
      deleteStorageFolder(`dogs/${userId}/`),    // dog photos
      deleteStorageFolder(`certs/${userId}/`),   // trainer certificates
    ]);

    // ── Identity deletion (last) ──────────────────────────────────────────────
    // 5. Firestore user document
    await db.collection("users").doc(userId).delete();

    // 6. Firebase Auth account — very last so token stays valid throughout
    await admin.auth().deleteUser(userId);

    functions.logger.info("User account fully deleted", { userId });
    res.status(200).json({ success: true });
  } catch (error: any) {
    functions.logger.error("Error deleting user", { userId, message: error.message });
    res.status(500).json({ error: "Failed to delete account" });
  }
});

/**
 * Admin-only: grant (or revoke) coins to a user. Used for support/compensation
 * and for testing premium features. Verifies the caller has the `admin` custom
 * claim (set via Firebase Console / setCustomUserClaims). Records the change in
 * coin_transactions for audit. Allows negative amounts to subtract coins.
 *
 * Bounds: -1,000,000 ≤ amount ≤ 1,000,000 (typo guard). Resulting balance must
 * be >= 0; otherwise the call is rejected.
 */
export const adminGrantCoins = functions.https.onRequest(async (req, res) => {
  const allowedOrigin = process.env.APP_ORIGIN ?? "https://dogly-train.web.app";
  res.set("Access-Control-Allow-Origin", allowedOrigin);
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.status(204).send("");
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Verify caller is an admin via custom claim.
  const authHeader = req.headers.authorization ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) { res.status(401).json({ error: "Unauthorized" }); return; }
  let callerUid: string;
  let isAdmin: boolean;
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    callerUid = decoded.uid;
    isAdmin = decoded.admin === true;
  } catch {
    res.status(401).json({ error: "Invalid token" });
    return;
  }
  if (!isAdmin) {
    res.status(403).json({ error: "Admin only" });
    return;
  }

  const { userId, amount, reason } = req.body ?? {};
  if (!userId || typeof userId !== "string") {
    res.status(400).json({ error: "Missing userId" });
    return;
  }
  const amt = Number(amount);
  if (!Number.isFinite(amt) || !Number.isInteger(amt) || amt === 0) {
    res.status(400).json({ error: "Amount must be a non-zero integer" });
    return;
  }
  if (amt < -1_000_000 || amt > 1_000_000) {
    res.status(400).json({ error: "Amount out of range" });
    return;
  }
  const safeReason = typeof reason === "string" ? reason.slice(0, 200) : "";

  try {
    let newBalance = 0;
    await db.runTransaction(async (tx) => {
      const userRef = db.collection("users").doc(userId);
      const snap = await tx.get(userRef);
      if (!snap.exists) {
        const e = new Error("user_not_found"); (e as any).code = "user_not_found"; throw e;
      }
      const balance = snap.data()?.coinBalance ?? 0;
      const candidate = balance + amt;
      if (candidate < 0) {
        const e = new Error("would_go_negative"); (e as any).code = "would_go_negative"; throw e;
      }
      newBalance = candidate;
      tx.update(userRef, {
        coinBalance: newBalance,
        updatedAt: admin.firestore.Timestamp.now(),
      });
      const txRef = db.collection("coin_transactions").doc();
      tx.set(txRef, {
        userId,
        type: amt > 0 ? "admin_grant" : "admin_deduct",
        amount: amt,
        balanceAfter: newBalance,
        reference: `admin_${callerUid}_${Date.now()}`,
        adminUid: callerUid,
        reason: safeReason,
        createdAt: admin.firestore.Timestamp.now(),
      });
    });

    functions.logger.info("Admin coin adjustment", {
      adminUid: callerUid, userId, amount: amt, newBalance,
    });
    res.status(200).json({ success: true, newBalance });
  } catch (error: any) {
    const code: string = error.code ?? "";
    const map: Record<string, string> = {
      user_not_found: "user_not_found",
      would_go_negative: "would_go_negative",
    };
    res.status(400).json({ error: map[code] ?? "grant_failed" });
  }
});
