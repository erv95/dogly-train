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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripeWebhook = exports.createCheckoutSession = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const stripe_1 = __importDefault(require("stripe"));
const db = admin.firestore();
// Stripe keys are set via environment variables.
// Locally: functions/.env
// Production: Firebase Console → Functions → Environment variables
function getStripe() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key)
        throw new Error("STRIPE_SECRET_KEY not configured");
    return new stripe_1.default(key, { apiVersion: "2024-04-10" });
}
// Coin packages matching the client-side config
const COIN_PACKAGES = {
    pack_20: { coins: 20, priceInCents: 199 },
    pack_50: { coins: 50, priceInCents: 399 },
    pack_100: { coins: 100, priceInCents: 699 },
    pack_200: { coins: 200, priceInCents: 1199 },
    pack_500: { coins: 500, priceInCents: 2499 },
};
/**
 * Create a Stripe Checkout session.
 * Client calls this, gets a URL, redirects user to Stripe.
 */
exports.createCheckoutSession = functions.https.onRequest(async (req, res) => {
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
    const { userId, packageId } = req.body;
    if (!userId || !packageId) {
        res.status(400).json({ error: "Missing userId or packageId" });
        return;
    }
    const pkg = COIN_PACKAGES[packageId];
    if (!pkg) {
        res.status(400).json({ error: "Invalid package" });
        return;
    }
    try {
        const stripe = getStripe();
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [
                {
                    price_data: {
                        currency: "usd",
                        product_data: {
                            name: `${pkg.coins} Dogly Coins`,
                            description: `Pack of ${pkg.coins} coins for Dogly Train`,
                        },
                        unit_amount: pkg.priceInCents,
                    },
                    quantity: 1,
                },
            ],
            mode: "payment",
            success_url: "https://dogly-train.web.app/payment-success",
            cancel_url: "https://dogly-train.web.app/payment-cancel",
            metadata: {
                userId,
                packageId,
                coins: String(pkg.coins),
            },
        });
        functions.logger.info("Checkout session created", {
            sessionId: session.id,
            userId,
            packageId,
        });
        res.status(200).json({ url: session.url });
    }
    catch (error) {
        functions.logger.error("Error creating checkout session", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
/**
 * Stripe webhook handler.
 * Listens for checkout.session.completed to credit coins.
 * Idempotent — checks if transaction already processed.
 */
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
    var _a;
    if (req.method !== "POST") {
        res.status(405).send("Method not allowed");
        return;
    }
    const stripe = getStripe();
    const webhookSecret = (_a = process.env.STRIPE_WEBHOOK_SECRET) !== null && _a !== void 0 ? _a : "";
    let event;
    try {
        const sig = req.headers["stripe-signature"];
        event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    }
    catch (err) {
        functions.logger.error("Webhook signature verification failed", err.message);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }
    if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const { userId, packageId, coins } = session.metadata || {};
        if (!userId || !coins) {
            functions.logger.error("Missing metadata in session", session.id);
            res.status(400).send("Missing metadata");
            return;
        }
        const coinsAmount = parseInt(coins, 10);
        const txId = `stripe_${session.id}`;
        // Idempotency check
        const existingTx = await db.collection("coin_transactions").doc(txId).get();
        if (existingTx.exists) {
            functions.logger.info("Transaction already processed", txId);
            res.status(200).send("Already processed");
            return;
        }
        // Credit coins in a transaction
        await db.runTransaction(async (transaction) => {
            var _a, _b;
            const userRef = db.collection("users").doc(userId);
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new Error(`User ${userId} not found`);
            }
            const currentBalance = (_b = (_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.coinBalance) !== null && _b !== void 0 ? _b : 0;
            const newBalance = currentBalance + coinsAmount;
            // Update user balance
            transaction.update(userRef, {
                coinBalance: newBalance,
                updatedAt: admin.firestore.Timestamp.now(),
            });
            // Create transaction record
            transaction.set(db.collection("coin_transactions").doc(txId), {
                userId,
                type: "purchase",
                amount: coinsAmount,
                balanceAfter: newBalance,
                reference: session.id,
                createdAt: admin.firestore.Timestamp.now(),
            });
        });
        functions.logger.info("Coins credited", { userId, coins: coinsAmount, txId });
    }
    res.status(200).send("OK");
});
//# sourceMappingURL=payments.js.map