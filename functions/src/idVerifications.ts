import * as functions from "firebase-functions";
import { db, notifyByPush } from "./_shared";

/**
 * Firestore trigger: when a provider submits an identity verification (doc
 * created under id_verifications/{userId}), notify every admin via push so
 * they can review it ASAP and unblock the provider's marketplace listing.
 *
 * Admin targeting goes through the queryable `admins/` collection because
 * Custom Claims (`token.admin == true`) live in the JWT only and can't be
 * read server-side via a Firestore query. The two lists are paired but NOT
 * auto-synced — when granting/revoking admin, update both.
 *
 * Best-effort: any error is logged but never thrown — a failed push must
 * never block the verification submission itself.
 */
export const onIdVerificationCreate = functions.firestore
  .document("id_verifications/{verificationId}")
  .onCreate(async (snap) => {
    try {
      const data = snap.data();
      if (!data || data.status !== "pending") return;

      const adminsSnap = await db.collection("admins").get();
      if (adminsSnap.empty) {
        functions.logger.warn("onIdVerificationCreate: no admins to notify", {
          verificationId: snap.id,
        });
        return;
      }

      const userSnap = await db.collection("users").doc(data.userId).get();
      const providerName = userSnap.data()?.displayName ?? "Provider";
      const providerRole = userSnap.data()?.role ?? "provider";

      await Promise.all(
        adminsSnap.docs.map((adminDoc) =>
          notifyByPush(adminDoc.id, {
            title: "Nueva verificación pendiente",
            body: `${providerName} (${providerRole}) ha enviado documentos para verificar`,
            data: {
              type: "admin_verification",
              verificationId: snap.id,
              userId: data.userId,
            },
          }),
        ),
      );

      functions.logger.info("onIdVerificationCreate notified admins", {
        verificationId: snap.id,
        adminsNotified: adminsSnap.size,
      });
    } catch (error) {
      functions.logger.error("onIdVerificationCreate failed", error);
    }
  });
