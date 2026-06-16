import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { db, enforceRateLimit } from "./_shared";
import { getPaypalBase, getPaypalAccessToken } from "./_paypal";
import { applyPremium } from "./premium";

// Coin packages — single source of truth for coin amounts.
// Never trust the coins value from the client or custom_id.
const COIN_PACKAGES: Record<string, { coins: number; priceUsd: string }> = {
  pack_20: { coins: 20, priceUsd: "1.99" },
  pack_50: { coins: 50, priceUsd: "3.99" },
  pack_100: { coins: 100, priceUsd: "6.99" },
  pack_200: { coins: 200, priceUsd: "11.99" },
  pack_500: { coins: 500, priceUsd: "24.99" },
};

/**
 * Verify PayPal webhook signature via PayPal's official verification API.
 * This is the only safe way to confirm a webhook came from PayPal.
 * Requires PAYPAL_WEBHOOK_ID set in environment variables.
 */
async function verifyPaypalWebhook(
  req: functions.https.Request,
  accessToken: string
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    functions.logger.error("PAYPAL_WEBHOOK_ID not configured — webhook rejected");
    return false;
  }

  try {
    const verifyRes = await fetch(
      `${getPaypalBase()}/v1/notifications/verify-webhook-signature`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          auth_algo: req.headers["paypal-auth-algo"],
          cert_url: req.headers["paypal-cert-url"],
          transmission_id: req.headers["paypal-transmission-id"],
          transmission_sig: req.headers["paypal-transmission-sig"],
          transmission_time: req.headers["paypal-transmission-time"],
          webhook_id: webhookId,
          webhook_event: req.body,
        }),
      }
    );

    if (!verifyRes.ok) return false;
    const data = (await verifyRes.json()) as { verification_status: string };
    return data.verification_status === "SUCCESS";
  } catch (err) {
    functions.logger.error("PayPal verification request failed", err);
    return false;
  }
}

/**
 * Create a PayPal order and return the approval URL.
 * Coins amount is embedded in custom_id using packageId only —
 * the webhook resolves the amount from its own server-side table.
 */
export const createPaypalOrder = functions.https.onRequest(async (req, res) => {
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

  const { userId, packageId } = req.body;
  if (!userId || typeof userId !== "string" || !packageId || typeof packageId !== "string") {
    res.status(400).json({ error: "Missing or invalid userId/packageId" });
    return;
  }
  if (verifiedUid !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const pkg = COIN_PACKAGES[packageId];
  if (!pkg) { res.status(400).json({ error: "Invalid package" }); return; }

  // Rate limit: max 5 orders per user per minute.
  // Atomic helper — responds {error:"rate_limited"} on 429.
  if (!(await enforceRateLimit(res, `paypal_${userId}`, 5, 60))) return;

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
            amount: { currency_code: "USD", value: pkg.priceUsd },
            description: `${pkg.coins} Dogly Coins`,
            // Only store userId + packageId — coins are resolved server-side on webhook
            custom_id: `${userId}::${packageId}`,
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

    if (!orderRes.ok) throw new Error("Failed to create PayPal order");
    const order = (await orderRes.json()) as { links: { rel: string; href: string }[] };

    const approvalLink = order.links.find((l) => l.rel === "approve")?.href;
    if (!approvalLink) throw new Error("No approval link in PayPal response");

    functions.logger.info("PayPal order created", { userId, packageId });
    res.status(200).json({ url: approvalLink });
  } catch (error: any) {
    functions.logger.error("Error creating PayPal order", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PayPal webhook handler.
 * Security chain:
 *   1. Verify PayPal signature (prevents forged events)
 *   2. Resolve coins from server-side package table (prevents tampered custom_id)
 *   3. Idempotency check inside Firestore transaction (prevents double-credit on concurrent delivery)
 */
export const paypalWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") { res.status(405).send("Method not allowed"); return; }

  const eventType = req.body?.event_type;
  if (eventType !== "PAYMENT.CAPTURE.COMPLETED") {
    res.status(200).send("Ignored");
    return;
  }

  // Step 0: Reject stale webhooks (10-min window — matches Stripe default).
  // Idempotency (txId = paypal_<captureId>) still catches true replays inside
  // the window. If PayPal's retry policy needs more, widen with care.
  const transmissionTime = req.headers["paypal-transmission-time"] as string | undefined;
  if (transmissionTime) {
    const transmissionMs = new Date(transmissionTime).getTime();
    if (isNaN(transmissionMs) || Math.abs(Date.now() - transmissionMs) > 10 * 60 * 1000) {
      functions.logger.warn("PayPal webhook rejected: stale transmission_time", { transmissionTime });
      res.status(401).send("Stale webhook");
      return;
    }
  }

  // Step 1: Verify webhook signature before touching any data
  try {
    const accessToken = await getPaypalAccessToken();
    const isValid = await verifyPaypalWebhook(req, accessToken);
    if (!isValid) {
      functions.logger.warn("PayPal webhook signature verification failed — request rejected");
      res.status(401).send("Unauthorized");
      return;
    }
  } catch (err) {
    functions.logger.error("PayPal webhook verification error", err);
    res.status(500).send("Verification error");
    return;
  }

  try {
    const resource = req.body?.resource;
    const captureId: string = resource?.id;
    const customId: string =
      resource?.custom_id ??
      resource?.purchase_units?.[0]?.custom_id ??
      "";

    if (!captureId || !customId) {
      functions.logger.warn("PayPal webhook missing captureId or customId");
      res.status(400).send("Missing data");
      return;
    }

    // Premium one-time purchase — custom_id format: "premium::{userId}"
    if (customId.startsWith("premium::")) {
      const userId = customId.slice("premium::".length);
      if (!userId) {
        functions.logger.warn("PayPal webhook invalid premium customId", { customId });
        res.status(400).send("Invalid custom_id");
        return;
      }
      try {
        await applyPremium(userId, captureId, "paypal");
        res.status(200).send("OK");
        return;
      } catch (err: any) {
        functions.logger.error("Premium activation failed (paypal)", { captureId, err: err.message });
        res.status(500).send("Premium activation failed");
        return;
      }
    }

    // Coin pack — custom_id format: "{userId}::{packageId}"
    const [userId, packageId] = customId.split("::");
    if (!userId || !packageId) {
      functions.logger.warn("PayPal webhook invalid customId format", { customId });
      res.status(400).send("Invalid custom_id");
      return;
    }

    // Step 2: Resolve coins from server-side table — never trust values from custom_id
    const pkg = COIN_PACKAGES[packageId];
    if (!pkg) {
      functions.logger.warn("PayPal webhook unknown packageId", { packageId });
      res.status(400).send("Unknown package");
      return;
    }
    const coinsAmount = pkg.coins;

    const txId = `paypal_${captureId}`;

    // Step 3: Idempotency check INSIDE the transaction — prevents double-credit
    // from concurrent webhook deliveries of the same event.
    await db.runTransaction(async (tx) => {
      const txRef = db.collection("coin_transactions").doc(txId);
      const existingTx = await tx.get(txRef);
      if (existingTx.exists) return; // already processed — abort silently

      const userRef = db.collection("users").doc(userId);
      const userDoc = await tx.get(userRef);
      if (!userDoc.exists) throw new Error(`User ${userId} not found`);

      const userData = userDoc.data()!;
      if (userData.status === "suspended" || userData.status === "banned") {
        functions.logger.warn("PayPal webhook for inactive user, skipping", { userId, status: userData.status });
        return;
      }

      const currentBalance = userData.coinBalance ?? 0;
      const newBalance = currentBalance + coinsAmount;

      tx.update(userRef, {
        coinBalance: newBalance,
        updatedAt: admin.firestore.Timestamp.now(),
      });

      tx.set(txRef, {
        userId,
        type: "purchase",
        amount: coinsAmount,
        balanceAfter: newBalance,
        reference: captureId,
        packageId,
        createdAt: admin.firestore.Timestamp.now(),
      });
    });

    functions.logger.info("PayPal coins credited", { userId, coinsAmount, txId });
    res.status(200).send("OK");
  } catch (error: any) {
    functions.logger.error("PayPal webhook error", error);
    res.status(500).send("Internal server error");
  }
});
