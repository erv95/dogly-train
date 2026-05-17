import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { db, setupCors, verifyCallerToken, notifyByPush, sendSecurityEmail } from "./_shared";

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

    // If the caller is an admin, also strip their custom claims so the
    // current ID token (still valid up to ~60 min) can't keep performing
    // privileged operations. Without this, a compromised admin account
    // retains admin powers for the residual token lifetime — small window
    // but big blast radius. The admin will need their claims re-granted
    // (by another admin) after they re-authenticate.
    const wasAdmin = caller.isAdmin;
    if (wasAdmin) {
      try {
        await admin.auth().setCustomUserClaims(caller.uid, {});
      } catch (err: any) {
        functions.logger.warn("Failed to clear admin claims on revoke", {
          uid: caller.uid,
          err: err?.message,
        });
      }
    }

    // Audit log so admin can see security-related actions
    await db.collection("security_events").add({
      userId: caller.uid,
      type: "revoke_all_sessions",
      adminCleared: wasAdmin,
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
