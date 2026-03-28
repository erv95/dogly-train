"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUserAccount = exports.checkBoostExpiration = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
/**
 * Scheduled function: check and expire boosts.
 * Runs every hour. Clears boostedUntil for expired boosts.
 */
exports.checkBoostExpiration = functions.pubsub
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
exports.deleteUserAccount = functions.https.onRequest(async (req, res) => {
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
        if (!dogsSnapshot.empty)
            await batch1.commit();
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
        if (!reviewsGiven.empty || !reviewsReceived.empty)
            await batch2.commit();
        // 3. Delete user's coin transactions
        const txSnapshot = await db
            .collection("coin_transactions")
            .where("userId", "==", userId)
            .get();
        const batch3 = db.batch();
        txSnapshot.forEach((doc) => batch3.delete(doc.ref));
        if (!txSnapshot.empty)
            await batch3.commit();
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
        if (!chatsSnapshot.empty)
            await batch4.commit();
        // 5. Delete Firestore user document
        await db.collection("users").doc(userId).delete();
        // 6. Delete Firebase Auth account
        await admin.auth().deleteUser(userId);
        functions.logger.info("User account deleted", { userId });
        res.status(200).json({ success: true });
    }
    catch (error) {
        functions.logger.error("Error deleting user", error);
        res.status(500).json({ error: "Failed to delete account" });
    }
});
//# sourceMappingURL=admin.js.map