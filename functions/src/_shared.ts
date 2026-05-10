import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

// ── CORS ─────────────────────────────────────────────────────────────────────

/**
 * Sets the CORS headers used by every HTTP onRequest function in this codebase
 * and short-circuits OPTIONS preflights. Returns true if the response has been
 * fully handled (preflight) and the caller should `return` immediately.
 */
export function setupCors(req: functions.https.Request, res: functions.Response): boolean {
  const allowedOrigin = process.env.APP_ORIGIN ?? "https://dogly-train.web.app";
  res.set("Access-Control-Allow-Origin", allowedOrigin);
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.status(204).send("");
    return true;
  }
  return false;
}

// ── Token verification ───────────────────────────────────────────────────────

export interface CallerContext {
  uid: string;
  isAdmin: boolean;
  emailVerified: boolean;
}

/**
 * Verify Firebase ID token from Authorization: Bearer header. Returns null and
 * writes a 401 to res when missing/invalid — callers should `return` after a
 * null result.
 */
export async function verifyCallerToken(
  req: functions.https.Request,
  res: functions.Response,
): Promise<CallerContext | null> {
  const authHeader = req.headers.authorization ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) {
    res.status(401).json({ error: "unauthenticated" });
    return null;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      isAdmin: decoded.admin === true,
      emailVerified: decoded.email_verified === true,
    };
  } catch {
    res.status(401).json({ error: "invalid_token" });
    return null;
  }
}

// ── Rate limiting ────────────────────────────────────────────────────────────

/**
 * Simple per-key sliding-window rate limit using a `rate_limits/{key}` doc.
 * Throws a 429 when exceeded. Models the pattern in coins.ts:67-84.
 *
 * @param key  unique identifier for the bucket (e.g. `boost_${uid}`)
 * @param maxAttempts  max calls allowed in the window
 * @param windowSec    window length in seconds
 * @returns true if allowed (caller proceeds), false if blocked (caller has already
 *          received a 429 in res — caller should `return`).
 */
export async function enforceRateLimit(
  res: functions.Response,
  key: string,
  maxAttempts: number,
  windowSec: number,
): Promise<boolean> {
  const ref = db.collection("rate_limits").doc(key);
  const snap = await ref.get();
  const now = Date.now();
  const windowMs = windowSec * 1000;
  if (snap.exists) {
    const lastAt = snap.data()?.lastAt?.toDate?.();
    const count = snap.data()?.count ?? 0;
    if (lastAt && (now - lastAt.getTime()) < windowMs && count >= maxAttempts) {
      res.status(429).json({ error: "rate_limited" });
      return false;
    }
    if (lastAt && (now - lastAt.getTime()) >= windowMs) {
      await ref.set({ lastAt: admin.firestore.Timestamp.now(), count: 1 });
    } else {
      await ref.update({ count: admin.firestore.FieldValue.increment(1) });
    }
  } else {
    await ref.set({ lastAt: admin.firestore.Timestamp.now(), count: 1 });
  }
  return true;
}

// ── Idempotent transition log ────────────────────────────────────────────────

/**
 * Inside a transaction, check whether a transition has already been applied
 * (booking_transitions, referrals_transitions, etc). Returns true when the
 * transition doc already exists — the caller should treat it as a no-op.
 *
 * Otherwise, writes the transition doc as part of the same transaction.
 */
export async function idempotentTransition(
  tx: admin.firestore.Transaction,
  collection: string,
  docId: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const ref = db.collection(collection).doc(docId);
  const snap = await tx.get(ref);
  if (snap.exists) return true;
  tx.set(ref, {
    ...payload,
    appliedAt: admin.firestore.Timestamp.now(),
  });
  return false;
}

// ── Push notification by userId ──────────────────────────────────────────────

/**
 * Wrapper that reads fcmToken from `users/{uid}` and dispatches via sendPush.
 * Silently skips when the user doc / token is missing or the user is not active.
 *
 * NOTE: `sendPush` is imported inline to avoid a circular dep (notifications.ts
 * may evolve to import _shared in the future).
 */
export async function notifyByPush(
  userId: string,
  args: { title: string; body: string; data?: Record<string, string> },
): Promise<void> {
  if (!userId) return;
  try {
    const snap = await db.collection("users").doc(userId).get();
    if (!snap.exists) return;
    const { fcmToken, status } = snap.data() ?? {};
    if (!fcmToken || status !== "active") return;
    // Lazy import to break any cyclic dep if notifications.ts ever imports _shared.
    const { sendPush } = await import("./notifications");
    await sendPush(fcmToken, args.title, args.body, args.data, userId);
  } catch (err) {
    functions.logger.warn("notifyByPush failed", { userId, err: (err as any)?.message });
  }
}

// ── Shared constants ─────────────────────────────────────────────────────────

/** Coins granted to BOTH referrer and referred when a referral is claimed. */
export const REFERRAL_BONUS_COINS = 30;
/** Lifetime cap of claimed referrals per referrer (anti-fraud). */
export const REFERRAL_LIFETIME_CAP = 50;
/** Max distinct signups from the same IP hash in 24h before flagging for admin review. */
export const REFERRAL_IP_FLAG_THRESHOLD = 3;
