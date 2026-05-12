import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { db } from "./_shared";

/** Firestore commit batches cap at 500 ops. We chunk our updates so a user
 *  with hundreds of chats/bookings still gets propagated correctly. */
const BATCH_LIMIT = 400;

async function commitInChunks(
  ops: Array<(batch: admin.firestore.WriteBatch) => void>,
): Promise<void> {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const slice = ops.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    for (const op of slice) op(batch);
    await batch.commit();
  }
}

/** Core propagation: rewrite the denormalised copies of a user's profile in
 *  chats and active bookings. Used by:
 *  - `onUserUpdate` trigger (only when relevant fields actually changed)
 *  - `adminSyncUserDenormalized` (forced backfill from the admin panel)
 *
 *  Returns counts so the caller can log/report results. */
async function syncUserDenormalized(
  userId: string,
  fields: { displayName: boolean; photoURL: boolean; bizumPhone: boolean },
): Promise<{ chats: number; bookings: number; reviews: number }> {
  const userSnap = await db.collection("users").doc(userId).get();
  if (!userSnap.exists) return { chats: 0, bookings: 0, reviews: 0 };

  const u = userSnap.data() ?? {};
  const newName: string = u.displayName ?? "";
  const newPhoto: string | null = u.photoURL ?? null;
  const newBizum: string | null = u.bizumPhone ?? null;

  let chatsUpdated = 0;
  let bookingsUpdated = 0;

  // ── Chats ────────────────────────────────────────────────────────────────
  if (fields.displayName || fields.photoURL) {
    const chatsSnap = await db
      .collection("chats")
      .where("participants", "array-contains", userId)
      .get();
    const ops: Array<(batch: admin.firestore.WriteBatch) => void> = [];
    for (const chatDoc of chatsSnap.docs) {
      const update: Record<string, unknown> = {};
      if (fields.displayName) update[`participantNames.${userId}`] = newName;
      if (fields.photoURL) update[`participantPhotos.${userId}`] = newPhoto;
      ops.push((b) => b.update(chatDoc.ref, update as any));
    }
    if (ops.length > 0) {
      await commitInChunks(ops);
      chatsUpdated = ops.length;
    }
  }

  // ── Confirmed bookings (as owner) ───────────────────────────────────────
  const ops: Array<(batch: admin.firestore.WriteBatch) => void> = [];

  const asOwnerSnap = await db
    .collection("bookings")
    .where("ownerId", "==", userId)
    .where("status", "==", "confirmed")
    .get();
  for (const b of asOwnerSnap.docs) {
    const update: Record<string, unknown> = {};
    if (fields.displayName) update.ownerDisplayName = newName;
    if (fields.photoURL) update.ownerPhotoURL = newPhoto;
    if (Object.keys(update).length > 0) {
      update.updatedAt = admin.firestore.Timestamp.now();
      ops.push((batch) => batch.update(b.ref, update as any));
    }
  }

  // As provider
  const asProviderSnap = await db
    .collection("bookings")
    .where("providerId", "==", userId)
    .where("status", "==", "confirmed")
    .get();
  for (const b of asProviderSnap.docs) {
    const update: Record<string, unknown> = {};
    if (fields.displayName) update.providerDisplayName = newName;
    if (fields.photoURL) update.providerPhotoURL = newPhoto;
    if (fields.bizumPhone) update.providerBizumPhone = newBizum;
    if (Object.keys(update).length > 0) {
      update.updatedAt = admin.firestore.Timestamp.now();
      ops.push((batch) => batch.update(b.ref, update as any));
    }
  }

  if (ops.length > 0) {
    await commitInChunks(ops);
    bookingsUpdated = ops.length;
  }

  // ── Reviews (as author) ─────────────────────────────────────────────────
  // Reviews are public-facing, so we mirror displayName/photoURL of the
  // reviewer when they change so old reviews keep showing the latest name.
  let reviewsUpdated = 0;
  if (fields.displayName || fields.photoURL) {
    const reviewsSnap = await db
      .collection("reviews")
      .where("fromUserId", "==", userId)
      .get();
    const reviewOps: Array<(batch: admin.firestore.WriteBatch) => void> = [];
    for (const r of reviewsSnap.docs) {
      const update: Record<string, unknown> = {};
      if (fields.displayName) update.fromUserDisplayName = newName;
      if (fields.photoURL) update.fromUserPhotoURL = newPhoto;
      reviewOps.push((batch) => batch.update(r.ref, update as any));
    }
    if (reviewOps.length > 0) {
      await commitInChunks(reviewOps);
      reviewsUpdated = reviewOps.length;
    }
  }

  return { chats: chatsUpdated, bookings: bookingsUpdated, reviews: reviewsUpdated };
}

/** When a user updates their displayName, photoURL or bizumPhone, propagate
 *  the new values to denormalised copies. Early-returns when no relevant
 *  change happened so the function is near-free for boost/coin updates etc. */
export const onUserUpdate = functions.firestore
  .document("users/{userId}")
  .onUpdate(async (change, context) => {
    const userId = context.params.userId as string;
    const before = change.before.data() ?? {};
    const after = change.after.data() ?? {};

    const nameChanged = before.displayName !== after.displayName;
    const photoChanged = before.photoURL !== after.photoURL;
    const bizumChanged = before.bizumPhone !== after.bizumPhone;

    if (!nameChanged && !photoChanged && !bizumChanged) return;

    try {
      const result = await syncUserDenormalized(userId, {
        displayName: nameChanged,
        photoURL: photoChanged,
        bizumPhone: bizumChanged,
      });
      functions.logger.info("Propagated user change", {
        userId, ...result, nameChanged, photoChanged, bizumChanged,
      });
    } catch (err) {
      functions.logger.error("Failed to propagate user change", {
        userId, error: (err as any)?.message,
      });
    }
  });

// ── Admin-only: force-resync denormalised copies for a single user ──────────

export const adminSyncUserDenormalized = functions.https.onRequest(async (req, res) => {
  const allowedOrigin = process.env.APP_ORIGIN ?? "https://dogly-train.web.app";
  res.set("Access-Control-Allow-Origin", allowedOrigin);
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.status(204).send("");
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  // Verify admin custom claim
  const authHeader = req.headers.authorization ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) { res.status(401).json({ error: "unauthenticated" }); return; }
  let isAdmin = false;
  let callerUid = "";
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    callerUid = decoded.uid;
    isAdmin = decoded.admin === true;
  } catch {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  if (!isAdmin) {
    res.status(403).json({ error: "admin_only" });
    return;
  }

  const { userId } = req.body ?? {};
  if (!userId || typeof userId !== "string") {
    res.status(400).json({ error: "invalid_input" });
    return;
  }

  try {
    const result = await syncUserDenormalized(userId, {
      displayName: true,
      photoURL: true,
      bizumPhone: true,
    });
    functions.logger.info("Admin forced user denorm sync", {
      adminUid: callerUid, targetUid: userId, ...result,
    });
    res.status(200).json({ success: true, ...result });
  } catch (err: any) {
    functions.logger.error("adminSyncUserDenormalized failed", {
      adminUid: callerUid, targetUid: userId, error: err?.message,
    });
    res.status(500).json({ error: "sync_failed" });
  }
});
