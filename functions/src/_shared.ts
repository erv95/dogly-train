import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

/**
 * EU-region Firestore database (eur3 — Belgium/Netherlands) and Storage
 * bucket (europe-west1). Migrated 2026-05-12 from the legacy nam5 default
 * database / `dogly-train.firebasestorage.app` bucket — see Iter 1.0 of
 * robust-petting-owl.md. Every Cloud Function MUST import `db` and `bucket`
 * from here so a future region change becomes a single-file edit.
 */
export const db = getFirestore(admin.app(), "dogly-eu");
export const bucket = admin.storage().bucket("dogly-train-eu");

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
    const code = (err as any)?.code;
    // Permanent token-invalidity codes don't warrant WARN-level spam on every
    // subsequent notification — sendPush already cleans up the dead token.
    // Downgrade those to DEBUG; keep WARN for unexpected / retryable failures.
    const isPermanentTokenError =
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-registration-token" ||
      code === "messaging/invalid-argument";
    if (isPermanentTokenError) {
      functions.logger.debug("notifyByPush permanent token failure", { userId, code });
    } else {
      functions.logger.warn("notifyByPush failed", { userId, code, err: (err as any)?.message });
    }
  }
}

// ── Security email helper ───────────────────────────────────────────────────

/**
 * Writes a document to the `mail/` collection following the schema expected
 * by the official **Firebase Trigger Email extension**:
 *   https://firebase.google.com/products/extensions/firestore-send-email
 *
 * If the extension is installed and configured in the Firebase project, the
 * doc is consumed and an email is sent through the configured SMTP. If the
 * extension is NOT installed, the doc still serves as an audit trail of what
 * "should have been emailed".
 *
 * Used for security-critical events (account deletion, sessions revoked, etc).
 * Best-effort — never blocks the caller. Silently skips if the user doesn't
 * have an email on file.
 */
type SecurityEventType =
  | "account_deletion_requested"
  | "account_deletion_cancelled"
  | "sessions_revoked";

export async function sendSecurityEmail(
  userId: string,
  type: SecurityEventType,
  params: { scheduledDate?: string } = {},
): Promise<void> {
  try {
    const snap = await db.collection("users").doc(userId).get();
    if (!snap.exists) return;
    const data = snap.data() ?? {};
    const email: string | undefined = data.email;
    const name: string = data.displayName ?? "";
    if (!email || typeof email !== "string") return;

    const { subject, html, text } = renderSecurityEmail(type, name, params);
    await db.collection("mail").add({
      to: [email],
      message: { subject, html, text },
      meta: { userId, type, createdAt: admin.firestore.Timestamp.now() },
    });
  } catch (err) {
    functions.logger.warn("sendSecurityEmail failed", {
      userId, type, err: (err as any)?.message,
    });
  }
}

function renderSecurityEmail(
  type: SecurityEventType,
  name: string,
  params: { scheduledDate?: string },
): { subject: string; html: string; text: string } {
  const greeting = name ? `Hola ${name},` : "Hola,";
  switch (type) {
    case "account_deletion_requested":
      return {
        subject: "Solicitud de borrado de cuenta — Dogly Train",
        text: `${greeting}\n\nHemos recibido tu solicitud de borrado de cuenta. Se ejecutará el ${params.scheduledDate}.\n\nSi cambias de opinión, inicia sesión antes de esa fecha y pulsa "Restaurar mi cuenta".\n\nSi no fuiste tú, cambia tu contraseña inmediatamente y contacta con soporte.\n\n— Equipo Dogly Train`,
        html: `<p>${greeting}</p><p>Hemos recibido tu solicitud de <b>borrado de cuenta</b>. Se ejecutará el <b>${params.scheduledDate}</b>.</p><p>Si cambias de opinión, inicia sesión antes de esa fecha y pulsa <b>"Restaurar mi cuenta"</b>.</p><p style="color:#EF4444"><b>Si no fuiste tú</b>, cambia tu contraseña inmediatamente y contacta con soporte.</p><p>— Equipo Dogly Train 🐾</p>`,
      };
    case "account_deletion_cancelled":
      return {
        subject: "Borrado de cuenta cancelado — Dogly Train",
        text: `${greeting}\n\nHas cancelado el borrado de tu cuenta. Tu cuenta vuelve a estar activa.\n\n— Equipo Dogly Train`,
        html: `<p>${greeting}</p><p>Has cancelado el borrado de tu cuenta. Tu cuenta vuelve a estar <b>activa</b>.</p><p>— Equipo Dogly Train 🐾</p>`,
      };
    case "sessions_revoked":
      return {
        subject: "Sesión cerrada en todos los dispositivos — Dogly Train",
        text: `${greeting}\n\nHemos cerrado tu sesión en todos los dispositivos a petición tuya. Para volver a entrar usa tu contraseña.\n\nSi no fuiste tú, cambia tu contraseña inmediatamente y contacta con soporte.\n\n— Equipo Dogly Train`,
        html: `<p>${greeting}</p><p>Hemos cerrado tu sesión en <b>todos los dispositivos</b> a petición tuya. Para volver a entrar usa tu contraseña.</p><p style="color:#EF4444"><b>Si no fuiste tú</b>, cambia tu contraseña inmediatamente y contacta con soporte.</p><p>— Equipo Dogly Train 🐾</p>`,
      };
  }
}

// ── Shared constants ─────────────────────────────────────────────────────────

/** Coins granted to BOTH referrer and referred when a referral is claimed. */
export const REFERRAL_BONUS_COINS = 30;
/** Lifetime cap of claimed referrals per referrer (anti-fraud). */
export const REFERRAL_LIFETIME_CAP = 50;
/** Max distinct signups from the same IP hash in 24h before flagging for admin review. */
export const REFERRAL_IP_FLAG_THRESHOLD = 3;

// ── Rate-limit cleanup ───────────────────────────────────────────────────────

/**
 * Daily cron — prunes stale `rate_limits/{key}` docs so the collection does
 * not grow unbounded. `enforceRateLimit` creates one doc per (uid, action)
 * pair and only updates it; without a sweep the collection accumulates
 * forever. Anything older than 24h is older than every rate window we use,
 * so it's safe to delete.
 *
 * Processes up to 500 docs per run; with normal traffic the backlog clears
 * in a single run.
 */
export const pruneRateLimits = functions.pubsub
  .schedule("every 24 hours")
  .onRun(async () => {
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
    const stale = await db.collection("rate_limits")
      .where("lastAt", "<", cutoff)
      .limit(500)
      .get();
    if (stale.empty) {
      functions.logger.info("pruneRateLimits: nothing to delete");
      return;
    }
    const batch = db.batch();
    stale.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    functions.logger.info("pruneRateLimits done", { deleted: stale.size });
  });
