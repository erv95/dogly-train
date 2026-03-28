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
exports.activateBoost = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
const BOOST_COST = 20;
const BOOST_DURATION_HOURS = 24;
/**
 * Activate boost for a trainer.
 * Deducts coins server-side and sets boostedUntil.
 */
exports.activateBoost = functions.https.onRequest(async (req, res) => {
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
            var _a;
            const userRef = db.collection("users").doc(userId);
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new Error("User not found");
            }
            const data = userDoc.data();
            if (data.role !== "trainer") {
                throw new Error("Only trainers can boost");
            }
            const currentBalance = (_a = data.coinBalance) !== null && _a !== void 0 ? _a : 0;
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
    }
    catch (error) {
        functions.logger.error("Boost activation failed", error.message);
        res.status(400).json({ error: error.message });
    }
});
//# sourceMappingURL=coins.js.map