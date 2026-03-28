import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import Stripe from "stripe";

const db = admin.firestore();

// Stripe keys are set via environment variables.
// Locally: functions/.env
// Production: Firebase Console → Functions → Environment variables
function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key, { apiVersion: "2024-04-10" as any });
}

// Coin packages matching the client-side config
const COIN_PACKAGES: Record<string, { coins: number; priceInCents: number }> = {
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
export const createCheckoutSession = functions.https.onRequest(async (req, res) => {
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
  } catch (error: any) {
    functions.logger.error("Error creating checkout session", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Stripe webhook handler.
 * Listens for checkout.session.completed to credit coins.
 * Idempotent — checks if transaction already processed.
 */
export const stripeWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

  let event: Stripe.Event;
  try {
    const sig = req.headers["stripe-signature"] as string;
    event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err: any) {
    functions.logger.error("Webhook signature verification failed", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
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
      const userRef = db.collection("users").doc(userId);
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) {
        throw new Error(`User ${userId} not found`);
      }

      const currentBalance = userDoc.data()?.coinBalance ?? 0;
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
