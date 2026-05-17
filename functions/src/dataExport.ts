import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { db, setupCors, verifyCallerToken, enforceRateLimit } from "./_shared";

/**
 * GDPR Article 20 — Right to data portability.
 * Returns a JSON dump of everything the calling user owns. Heavy read, so we
 * rate-limit to a few calls per hour. The client persists the response to a
 * file and shares via the OS share sheet.
 *
 * Fields stripped from the user profile:
 * - admin / role internal flags users can't legally request to "port" (the
 *   coin balance is included, but ledger lives in coin_transactions)
 * - sumRatings: server-side aggregate, derivable from reviews.
 *
 * Sub-collections under booking_live_sessions are NOT inlined — they can be
 * very large (path points). We include the session metadata; the user can
 * request a separate dump for a specific session if they need the GPS trail.
 *
 * Chat messages are NOT exported: they contain other users' content. The user
 * can read their own chats inside the app.
 */

interface ExportPayload {
  exportedAt: string;            // ISO timestamp
  userId: string;
  format: string;                // "dogly-train/v1"
  data: Record<string, unknown>;
}

/** Recursively turn Firestore Timestamps into ISO strings so the JSON is
 *  self-describing for downstream tooling. */
function normalize(value: any): any {
  if (value === null || value === undefined) return value;
  if (value instanceof admin.firestore.Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = normalize(v);
    return out;
  }
  return value;
}

async function fetchDocs(
  collection: string,
  where: [string, FirebaseFirestore.WhereFilterOp, unknown][],
  cap = 1000,
): Promise<Array<Record<string, unknown>>> {
  let q: FirebaseFirestore.Query = db.collection(collection);
  for (const [field, op, val] of where) q = q.where(field, op, val);
  const snap = await q.limit(cap).get();
  return snap.docs.map((d) => ({ id: d.id, ...normalize(d.data()) }));
}

export const exportUserData = functions.https.onRequest(async (req, res) => {
  if (setupCors(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const caller = await verifyCallerToken(req, res);
  if (!caller) return;

  const uid = caller.uid;

  // 3 exports / hour ought to be plenty — guards against runaway scripts.
  if (!(await enforceRateLimit(res, `export_${uid}`, 3, 3600))) return;

  try {
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) {
      res.status(404).json({ error: "user_not_found" });
      return;
    }
    const rawUser = userSnap.data() ?? {};

    // Sanitise the profile: drop server-only / admin-derived fields
    const SENSITIVE_USER_FIELDS = [
      "admin", "sumRatings", "fcmToken", "signupIpHash",
    ];
    const profile: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rawUser)) {
      if (SENSITIVE_USER_FIELDS.includes(k)) continue;
      profile[k] = normalize(v);
    }
    profile.id = uid;

    // Pull each collection in parallel.
    const [
      dogs,
      bookingsAsOwner,
      bookingsAsProvider,
      reviewsAuthored,
      reviewsReceived,
      coinTransactions,
      referralsAsReferrer,
      referralsAsReferred,
      liveSessions,
      walks,
      vetRecords,
      weeklyPlans,
      challengeProgress,
      emergencyContacts,
      reminders,
      idVerifications,
      placesOwned,
      courseProgress,
      securityEvents,
    ] = await Promise.all([
      fetchDocs("dogs", [["ownerId", "==", uid]]),
      fetchDocs("bookings", [["ownerId", "==", uid]]),
      fetchDocs("bookings", [["providerId", "==", uid]]),
      fetchDocs("reviews", [["fromUserId", "==", uid]]),
      fetchDocs("reviews", [["toUserId", "==", uid]]),
      fetchDocs("coin_transactions", [["userId", "==", uid]]),
      fetchDocs("referrals", [["referrerId", "==", uid]]),
      fetchDocs("referrals", [["referredId", "==", uid]]),
      // Live sessions: pull both sides separately, dedupe by id
      Promise.all([
        fetchDocs("booking_live_sessions", [["ownerId", "==", uid]]),
        fetchDocs("booking_live_sessions", [["providerId", "==", uid]]),
      ]).then(([a, b]) => {
        const map = new Map<string, Record<string, unknown>>();
        for (const r of [...a, ...b]) map.set(r.id as string, r);
        return [...map.values()];
      }),
      fetchDocs("dog_walks", [["userId", "==", uid]]),
      fetchDocs("vet_records", [["userId", "==", uid]]),
      fetchDocs("weekly_plans", [["userId", "==", uid]]),
      fetchDocs("challenge_progress", [["userId", "==", uid]]),
      fetchDocs("emergency_contacts", [["userId", "==", uid]]),
      fetchDocs("dog_reminders", [["userId", "==", uid]]),
      fetchDocs("id_verifications", [["userId", "==", uid]]),
      fetchDocs("places", [["submittedBy", "==", uid]]),
      fetchDocs("course_progress", [["userId", "==", uid]]),
      fetchDocs("security_events", [["userId", "==", uid]], 200),
    ]);

    const payload: ExportPayload = {
      exportedAt: new Date().toISOString(),
      userId: uid,
      format: "dogly-train/v1",
      data: {
        profile,
        dogs,
        bookings: { asOwner: bookingsAsOwner, asProvider: bookingsAsProvider },
        reviews: { authored: reviewsAuthored, received: reviewsReceived },
        coin_transactions: coinTransactions,
        referrals: { asReferrer: referralsAsReferrer, asReferred: referralsAsReferred },
        live_sessions: liveSessions,
        dog_walks: walks,
        vet_records: vetRecords,
        weekly_plans: weeklyPlans,
        challenge_progress: challengeProgress,
        emergency_contacts: emergencyContacts,
        reminders,
        id_verifications: idVerifications,
        places_owned: placesOwned,
        course_progress: courseProgress,
        security_events: securityEvents,
      },
    };

    // Audit log so admin can see who exported and when (no PII content logged).
    await db.collection("security_events").add({
      userId: uid,
      type: "data_export",
      ip: req.headers["x-forwarded-for"]?.toString().split(",")[0] ?? null,
      userAgent: req.headers["user-agent"] ?? null,
      createdAt: admin.firestore.Timestamp.now(),
    });

    functions.logger.info("Data export delivered", {
      uid,
      counts: {
        dogs: dogs.length,
        bookings: bookingsAsOwner.length + bookingsAsProvider.length,
        reviews: reviewsAuthored.length + reviewsReceived.length,
        coin_transactions: coinTransactions.length,
      },
    });

    res.status(200).json(payload);
  } catch (err: any) {
    functions.logger.error("exportUserData failed", { uid, err: err?.message });
    res.status(500).json({ error: "export_failed" });
  }
});
