import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import Stripe from "stripe";
import { db, enforceRateLimit } from "./_shared";
import { applyPremium } from "./premium";

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

  // Verify Firebase ID token — caller must be the userId they claim
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

  const { userId, packageId } = req.body;

  if (!userId || typeof userId !== "string" || !packageId || typeof packageId !== "string") {
    res.status(400).json({ error: "Missing or invalid userId/packageId" });
    return;
  }

  // Prevent creating sessions on behalf of another user
  if (verifiedUid !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const pkg = COIN_PACKAGES[packageId];
  if (!pkg) {
    res.status(400).json({ error: "Invalid package" });
    return;
  }

  // Rate limit: max 5 checkout sessions per user per minute.
  // Atomic helper — responds {error:"rate_limited"} on 429.
  if (!(await enforceRateLimit(res, `stripe_${userId}`, 5, 60))) return;

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
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    functions.logger.error("STRIPE_WEBHOOK_SECRET not configured");
    res.status(500).send("Server misconfiguration");
    return;
  }

  let event: Stripe.Event;
  try {
    const sig = req.headers["stripe-signature"] as string;
    // tolerance: 300s rejects events whose timestamp is older than 5 minutes.
    // Stripe signatures already bind events to a timestamp, but a leaked-yet-
    // valid event captured from logs could be replayed within Stripe's
    // generous default tolerance (5min anyway, but being explicit prevents
    // accidental widening if the default ever changes).
    event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret, 300);
  } catch (err: any) {
    functions.logger.error("Webhook signature verification failed", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const { userId, packageId, coins, productType } = session.metadata || {};

    if (!userId) {
      functions.logger.error("Missing userId in session metadata", session.id);
      res.status(400).send("Missing metadata");
      return;
    }

    // Premium one-time purchase
    if (productType === "premium") {
      try {
        await applyPremium(userId, session.id, "stripe");
      } catch (err: any) {
        functions.logger.error("Premium activation failed", { sessionId: session.id, err: err.message });
        res.status(500).send("Premium activation failed");
        return;
      }
      res.status(200).send("OK");
      return;
    }

    // Coin pack (default flow)
    if (!coins) {
      functions.logger.error("Missing coins in session metadata", session.id);
      res.status(400).send("Missing metadata");
      return;
    }

    const coinsAmount = parseInt(coins, 10);
    if (isNaN(coinsAmount) || coinsAmount <= 0) {
      functions.logger.error("Invalid coins value", coins);
      res.status(400).send("Invalid coins value");
      return;
    }

    const txId = `stripe_${session.id}`;
    const txRef = db.collection("coin_transactions").doc(txId);

    // Idempotency check is INSIDE the transaction to prevent race conditions
    // between two concurrent webhook deliveries for the same event.
    try {
      await db.runTransaction(async (transaction) => {
        const existingTx = await transaction.get(txRef);
        if (existingTx.exists) {
          // Already processed — abort transaction silently
          return;
        }

        const userRef = db.collection("users").doc(userId);
        const userDoc = await transaction.get(userRef);

        if (!userDoc.exists) {
          // User deleted after purchase — log and return 200 to stop webhook retries
          functions.logger.warn("User not found for webhook, skipping", { userId, sessionId: session.id });
          return;
        }

        const userData = userDoc.data()!;
        if (userData.status === "suspended" || userData.status === "banned") {
          functions.logger.warn("Webhook for inactive user, skipping coin credit", { userId, status: userData.status });
          return;
        }

        const currentBalance = userData.coinBalance ?? 0;
        const newBalance = currentBalance + coinsAmount;

        transaction.update(userRef, {
          coinBalance: newBalance,
          updatedAt: admin.firestore.Timestamp.now(),
        });

        transaction.set(txRef, {
          userId,
          type: "purchase",
          amount: coinsAmount,
          balanceAfter: newBalance,
          reference: session.id,
          packageId: packageId ?? null,
          createdAt: admin.firestore.Timestamp.now(),
        });
      });
    } catch (err: any) {
      functions.logger.error("Transaction failed for session", session.id, err.message);
      res.status(500).send("Transaction failed");
      return;
    }

    functions.logger.info("Coins credited", { userId, coins: coinsAmount, txId });
  }

  res.status(200).send("OK");
});
