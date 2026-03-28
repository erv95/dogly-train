import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

/**
 * Scheduled function: check and expire boosts.
 * Runs every hour. Clears boostedUntil for expired boosts.
 */
export const checkBoostExpiration = functions.pubsub
  .schedule("every 1 hours")
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();

    const expiredSnapshot = await db
      .collection("users")
      .where("role", "==", "trainer")
      .where("boostedUntil", "<=", now)
      .get();

    if (expiredSnapshot.empty) {
      functions.logger.info("No expired boosts found");
      return;
    }

    const batch = db.batch();
    expiredSnapshot.forEach((doc) => {
      batch.update(doc.ref, {
        boostedUntil: null,
        updatedAt: admin.firestore.Timestamp.now(),
      });
    });

    await batch.commit();
    functions.logger.info(`Cleared ${expiredSnapshot.size} expired boosts`);
  });

/**
 * GDPR: Delete user account and all associated data.
 * Called from the client via HTTP.
 */
export const deleteUserAccount = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { userId } = req.body;
  if (!userId) {
    res.status(400).json({ error: "Missing userId" });
    return;
  }

  try {
    // 1. Delete user's dogs
    const dogsSnapshot = await db
      .collection("dogs")
      .where("ownerId", "==", userId)
      .get();
    const batch1 = db.batch();
    dogsSnapshot.forEach((doc) => batch1.delete(doc.ref));
    if (!dogsSnapshot.empty) await batch1.commit();

    // 2. Delete user's reviews (given and received)
    const reviewsGiven = await db
      .collection("reviews")
      .where("fromUserId", "==", userId)
      .get();
    const reviewsReceived = await db
      .collection("reviews")
      .where("toUserId", "==", userId)
      .get();
    const batch2 = db.batch();
    reviewsGiven.forEach((doc) => batch2.delete(doc.ref));
    reviewsReceived.forEach((doc) => batch2.delete(doc.ref));
    if (!reviewsGiven.empty || !reviewsReceived.empty) await batch2.commit();

    // 3. Delete user's coin transactions
    const txSnapshot = await db
      .collection("coin_transactions")
      .where("userId", "==", userId)
      .get();
    const batch3 = db.batch();
    txSnapshot.forEach((doc) => batch3.delete(doc.ref));
    if (!txSnapshot.empty) await batch3.commit();

    // 4. Delete user's messages (anonymize — keep chat but remove user data)
    // We don't delete chats to preserve the other user's history,
    // but we anonymize the participant name
    const chatsSnapshot = await db
      .collection("chats")
      .where("participants", "array-contains", userId)
      .get();
    const batch4 = db.batch();
    chatsSnapshot.forEach((doc) => {
      const data = doc.data();
      const updatedNames = { ...data.participantNames };
      const updatedPhotos = { ...data.participantPhotos };
      updatedNames[userId] = "Deleted User";
      updatedPhotos[userId] = null;
      batch4.update(doc.ref, {
        participantNames: updatedNames,
        participantPhotos: updatedPhotos,
      });
    });
    if (!chatsSnapshot.empty) await batch4.commit();

    // 5. Delete Firestore user document
    await db.collection("users").doc(userId).delete();

    // 6. Delete Firebase Auth account
    await admin.auth().deleteUser(userId);

    functions.logger.info("User account deleted", { userId });
    res.status(200).json({ success: true });
  } catch (error: any) {
    functions.logger.error("Error deleting user", error);
    res.status(500).json({ error: "Failed to delete account" });
  }
});
