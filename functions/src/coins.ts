import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { db, enforceRateLimit } from "./_shared";

const BOOST_COST = 20;
const BOOST_DURATION_HOURS = 24;

// Generic error codes returned to the client.
// Never expose internal state (balance amount, role, timing details).
const BOOST_ERROR_CODES: Record<string, string> = {
  user_not_found: "boost_failed",
  boost_ineligible: "boost_ineligible",   // not a trainer or account not active
  insufficient_coins: "insufficient_coins",
  boost_active: "boost_active",
};

/**
 * Activate boost for a trainer.
 * Deducts coins server-side and sets boostedUntil.
 * Guards: valid token, active trainer, sufficient balance, no active boost.
 */
export const activateBoost = functions.https.onRequest(async (req, res) => {
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

  // Verify Firebase ID token
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

  const { userId } = req.body;
  if (!userId || typeof userId !== "string") {
    res.status(400).json({ error: "Missing or invalid userId" });
    return;
  }

  // Prevent acting on behalf of another user
  if (verifiedUid !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Rate limit: max 3 boost attempts per user per minute.
  // Atomic helper — responds {error:"rate_limited"} on 429.
  if (!(await enforceRateLimit(res, `boost_${userId}`, 3, 60))) return;

  try {
    await db.runTransaction(async (transaction) => {
      const userRef = db.collection("users").doc(userId);
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) {
        const err = new Error("user_not_found"); (err as any).code = "user_not_found"; throw err;
      }

      const data = userDoc.data()!;

      // Must be an active trainer or caretaker — suspended/banned cannot boost
      if (
        (data.role !== "trainer" && data.role !== "caretaker")
        || data.status !== "active"
      ) {
        const err = new Error("boost_ineligible"); (err as any).code = "boost_ineligible"; throw err;
      }

      const currentBalance = data.coinBalance ?? 0;
      if (currentBalance < BOOST_COST) {
        const err = new Error("insufficient_coins"); (err as any).code = "insufficient_coins"; throw err;
      }

      // Check if already boosted — defensive against legacy data where
      // `boostedUntil` could be a Date, number, ISO string, or even garbage.
      if (data.boostedUntil) {
        const raw = data.boostedUntil;
        let boostedUntil: Date | null = null;
        if (raw && typeof raw.toDate === "function") boostedUntil = raw.toDate();
        else if (raw instanceof Date) boostedUntil = raw;
        else if (typeof raw === "number") boostedUntil = new Date(raw);
        else if (typeof raw === "string") {
          const parsed = new Date(raw);
          if (!isNaN(parsed.getTime())) boostedUntil = parsed;
        }
        if (boostedUntil && boostedUntil > new Date()) {
          const err = new Error("boost_active"); (err as any).code = "boost_active"; throw err;
        }
      }

      const newBalance = currentBalance - BOOST_COST;
      const boostedUntil = new Date();
      boostedUntil.setHours(boostedUntil.getHours() + BOOST_DURATION_HOURS);

      transaction.update(userRef, {
        coinBalance: newBalance,
        boostedUntil: admin.firestore.Timestamp.fromDate(boostedUntil),
        updatedAt: admin.firestore.Timestamp.now(),
      });

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
    const code: string = error.code ?? "";
    // Return a normalized error code — never expose internal state
    const clientError = BOOST_ERROR_CODES[code] ?? "boost_failed";
    // Log full error details server-side so debugging unexpected fallbacks
    // doesn't require asking users to reproduce. Never sent to the client.
    functions.logger.warn("Boost activation rejected", {
      userId,
      code,
      clientError,
      message: error?.message,
      stack: error?.stack?.split("\n").slice(0, 3).join(" | "),
    });
    res.status(400).json({ error: clientError });
  }
});
