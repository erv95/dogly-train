import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import Stripe from "stripe";
import { db } from "./_shared";
import { getPaypalBase, getPaypalAccessToken } from "./_paypal";

// Premium = one-time purchase to remove ads.
// Single price (server-side source of truth — never trust client).
const PREMIUM_PRICE_CENTS = 995; // €9.95
const PREMIUM_CURRENCY = "eur";
const PREMIUM_PRICE_USD_PAYPAL = "9.95"; // PayPal uses string format

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key, { apiVersion: "2024-04-10" as any });
}

/**
 * Apply premium status to a user — used by Stripe and PayPal webhooks.
 * Idempotent: a user already premium is left unchanged (no double-charge effect on flag).
 * Records the purchase via reference (session/capture id) to make it traceable.
 */
export async function applyPremium(
  userId: string,
  reference: string,
  source: "stripe" | "paypal"
): Promise<void> {
  const userRef = db.collection("users").doc(userId);
  await db.runTransaction(async (tx) => {
    const userDoc = await tx.get(userRef);
    if (!userDoc.exists) {
      functions.logger.warn("Premium webhook for unknown user, skipping", { userId, reference });
      return;
    }
    const data = userDoc.data()!;
    if (data.status === "suspended" || data.status === "banned") {
      functions.logger.warn("Premium webhook for inactive user, skipping", { userId, status: data.status });
      return;
    }
    // Idempotency: if already premium, just log
    if (data.isPremium === true) {
      functions.logger.info("User already premium, no-op", { userId, reference });
      return;
    }
    tx.update(userRef, {
      isPremium: true,
      premiumPurchasedAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    });
    functions.logger.info("Premium activated", { userId, reference, source });
  });
}

/**
 * Create a Stripe Checkout session for the one-time premium upgrade.
 */
export const createPremiumCheckoutStripe = functions.https.onRequest(async (req, res) => {
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
  if (!idToken) { res.status(401).json({ error: "Unauthorized" }); return; }
  let verifiedUid: string;
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    verifiedUid = decoded.uid;
  } catch {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  const { userId } = req.body;
  if (!userId || typeof userId !== "string") {
    res.status(400).json({ error: "Missing or invalid userId" });
    return;
  }
  if (verifiedUid !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Check if user already premium — no point creating a session
  try {
    const userDoc = await db.collection("users").doc(userId).get();
    if (userDoc.exists && userDoc.data()?.isPremium === true) {
      res.status(409).json({ error: "already_premium" });
      return;
    }
  } catch (err) {
    functions.logger.error("Error checking premium status", err);
  }

  // Rate limit: max 5 checkout sessions per user per minute
  const rateLimitRef = db.collection("rate_limits").doc(`premium_stripe_${userId}`);
  const rateLimitSnap = await rateLimitRef.get();
  if (rateLimitSnap.exists) {
    const lastAt = rateLimitSnap.data()?.lastAt?.toDate?.();
    const count = rateLimitSnap.data()?.count ?? 0;
    if (lastAt && (Date.now() - lastAt.getTime()) < 60_000 && count >= 5) {
      res.status(429).json({ error: "Too many requests. Please wait a moment." });
      return;
    }
    if (lastAt && (Date.now() - lastAt.getTime()) >= 60_000) {
      await rateLimitRef.set({ lastAt: admin.firestore.Timestamp.now(), count: 1 });
    } else {
      await rateLimitRef.update({ count: admin.firestore.FieldValue.increment(1) });
    }
  } else {
    await rateLimitRef.set({ lastAt: admin.firestore.Timestamp.now(), count: 1 });
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: PREMIUM_CURRENCY,
            product_data: {
              name: "Dogly Train Premium",
              description: "Remove ads forever — one-time purchase",
            },
            unit_amount: PREMIUM_PRICE_CENTS,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: "https://dogly-train.web.app/payment-success",
      cancel_url: "https://dogly-train.web.app/payment-cancel",
      metadata: {
        userId,
        productType: "premium", // distinguishes from coin purchases in webhook
      },
    });

    functions.logger.info("Premium checkout session created", {
      sessionId: session.id,
      userId,
    });
    res.status(200).json({ url: session.url });
  } catch (error: any) {
    functions.logger.error("Error creating premium checkout session", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Create a PayPal order for the premium upgrade.
 */
export const createPremiumOrderPaypal = functions.https.onRequest(async (req, res) => {
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
  if (!idToken) { res.status(401).json({ error: "Unauthorized" }); return; }
  let verifiedUid: string;
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    verifiedUid = decoded.uid;
  } catch {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  const { userId } = req.body;
  if (!userId || typeof userId !== "string") {
    res.status(400).json({ error: "Missing or invalid userId" });
    return;
  }
  if (verifiedUid !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Already premium check
  try {
    const userDoc = await db.collection("users").doc(userId).get();
    if (userDoc.exists && userDoc.data()?.isPremium === true) {
      res.status(409).json({ error: "already_premium" });
      return;
    }
  } catch (err) {
    functions.logger.error("Error checking premium status", err);
  }

  // Rate limit
  const rateLimitRef = db.collection("rate_limits").doc(`premium_paypal_${userId}`);
  const rateLimitSnap = await rateLimitRef.get();
  if (rateLimitSnap.exists) {
    const lastAt = rateLimitSnap.data()?.lastAt?.toDate?.();
    const count = rateLimitSnap.data()?.count ?? 0;
    if (lastAt && (Date.now() - lastAt.getTime()) < 60_000 && count >= 5) {
      res.status(429).json({ error: "Too many requests. Please wait a moment." });
      return;
    }
    if (lastAt && (Date.now() - lastAt.getTime()) >= 60_000) {
      await rateLimitRef.set({ lastAt: admin.firestore.Timestamp.now(), count: 1 });
    } else {
      await rateLimitRef.update({ count: admin.firestore.FieldValue.increment(1) });
    }
  } else {
    await rateLimitRef.set({ lastAt: admin.firestore.Timestamp.now(), count: 1 });
  }

  try {
    const accessToken = await getPaypalAccessToken();

    const orderRes = await fetch(`${getPaypalBase()}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: { currency_code: "EUR", value: PREMIUM_PRICE_USD_PAYPAL },
            description: "Dogly Train Premium — Remove ads",
            // custom_id format for premium: "premium::{userId}"
            custom_id: `premium::${userId}`,
          },
        ],
        application_context: {
          return_url: "https://dogly-train.web.app/payment-success",
          cancel_url: "https://dogly-train.web.app/payment-cancel",
          brand_name: "Dogly Train",
          user_action: "PAY_NOW",
        },
      }),
    });

    if (!orderRes.ok) throw new Error("Failed to create PayPal premium order");
    const order = (await orderRes.json()) as { links: { rel: string; href: string }[] };
    const approvalLink = order.links.find((l) => l.rel === "approve")?.href;
    if (!approvalLink) throw new Error("No approval link in PayPal response");

    functions.logger.info("PayPal premium order created", { userId });
    res.status(200).json({ url: approvalLink });
  } catch (error: any) {
    functions.logger.error("Error creating PayPal premium order", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
