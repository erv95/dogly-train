import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

const BOOST_COST = 20;
const BOOST_DURATION_HOURS = 24;

/**
 * Activate boost for a trainer.
 * Deducts coins server-side and sets boostedUntil.
 */
export const activateBoost = functions.https.onRequest(async (req, res) => {
  // CORS
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
    await db.runTransaction(async (transaction) => {
      const userRef = db.collection("users").doc(userId);
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) {
        throw new Error("User not found");
      }

      const data = userDoc.data()!;
      if (data.role !== "trainer") {
        throw new Error("Only trainers can boost");
      }

      const currentBalance = data.coinBalance ?? 0;
      if (currentBalance < BOOST_COST) {
        throw new Error("Insufficient coins");
      }

      // Check if already boosted
      if (data.boostedUntil) {
        const boostedUntil = data.boostedUntil.toDate();
        if (boostedUntil > new Date()) {
          throw new Error("Boost already active");
        }
      }

      const newBalance = currentBalance - BOOST_COST;
      const boostedUntil = new Date();
      boostedUntil.setHours(boostedUntil.getHours() + BOOST_DURATION_HOURS);

      // Update user
      transaction.update(userRef, {
        coinBalance: newBalance,
        boostedUntil: admin.firestore.Timestamp.fromDate(boostedUntil),
        updatedAt: admin.firestore.Timestamp.now(),
      });

      // Create transaction record
      const txRef = db.collection("coin_transactions").doc();
      transaction.set(txRef, {
        userId,
        type: "boost_spend",
        amount: -BOOST_COST,
        balanceAfter: newBalance,
        reference: `boost_${Date.now()}`,
        createdAt: admin.firestore.Timestamp.now(),
      });
    });

    functions.logger.info("Boost activated", { userId });
    res.status(200).json({ success: true });
  } catch (error: any) {
    functions.logger.error("Boost activation failed", error.message);
    res.status(400).json({ error: error.message });
  }
});
