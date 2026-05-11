import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { setupCors, verifyCallerToken, notifyByPush, sendSecurityEmail } from "./_shared";

const db = admin.firestore();

/**
 * Revoke all refresh tokens for the calling user. This forces every device
 * (including the calling one) to re-authenticate the next time their ID
 * token expires (~1h max).
 *
 * Use cases:
 * - User suspects their account was compromised
 * - Voluntary "log out everywhere" from settings
 * - Server-side response to an account event (password change → revoke
 *   propagates from another CF in the future).
 *
 * Pre-condition: client should re-auth (ReauthModal) before calling. We
 * still require a valid ID token here as basic protection.
 */
export const revokeAllSessions = functions.https.onRequest(async (req, res) => {
  if (setupCors(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const caller = await verifyCallerToken(req, res);
  if (!caller) return;

  try {
    await admin.auth().revokeRefreshTokens(caller.uid);

    // Audit log so admin can see security-related actions
    await db.collection("security_events").add({
      userId: caller.uid,
      type: "revoke_all_sessions",
      ip: req.headers["x-forwarded-for"]?.toString().split(",")[0] ?? null,
      userAgent: req.headers["user-agent"] ?? null,
      createdAt: admin.firestore.Timestamp.now(),
    });

    // Best-effort push so the user knows something happened (delivered to the
    // device that still has a valid FCM token before next refresh).
    await notifyByPush(caller.uid, {
      title: "Sesiones cerradas",
      body: "Hemos cerrado tu sesión en todos los dispositivos.",
      data: { type: "security_sessions_revoked" },
    });
    // Email audit trail. Best-effort — won't fail the call.
    await sendSecurityEmail(caller.uid, "sessions_revoked");

    functions.logger.info("Sessions revoked", { uid: caller.uid });
    res.status(200).json({ success: true });
  } catch (err: any) {
    functions.logger.error("revokeAllSessions failed", { uid: caller.uid, err: err?.message });
    res.status(500).json({ error: "revoke_failed" });
  }
});
