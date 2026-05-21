import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {
  db,
  setupCors,
  verifyCallerToken,
  notifyByPush,
} from "./_shared";

const START_WINDOW_MS = 2 * 60 * 60 * 1000;   // ±2h around serviceAt
const STALE_PING_MS = 30 * 60 * 1000;          // 30 min no ping → mark ended

// Round to nearest ~0.01° (≈1.1 km at 40° N). Applied to the LAST GPS point of
// a live session so the polyline doesn't reveal that the provider walked back
// to their own house at the end (overnight stays, doggy-day-care drop-offs).
// 500m grid was too tight for dense Madrid blocks — could still pinpoint the
// provider's home to a city-block resolution.
const ANON_GRID = 0.01;
function snapToGrid(n: number): number {
  return Math.round(n / ANON_GRID) * ANON_GRID;
}

async function anonymizeLastPathPoint(bookingId: string): Promise<void> {
  try {
    const pathSnap = await db
      .collection("booking_live_sessions").doc(bookingId)
      .collection("path")
      .orderBy("recordedAt", "desc")
      .limit(1)
      .get();
    if (pathSnap.empty) return;
    const doc = pathSnap.docs[0];
    const d = doc.data();
    if (typeof d.lat !== "number" || typeof d.lng !== "number") return;
    await doc.ref.update({
      lat: snapToGrid(d.lat),
      lng: snapToGrid(d.lng),
      anonymized: true,
    });
  } catch (err) {
    functions.logger.warn("anonymizeLastPathPoint failed", { bookingId, err: String(err) });
  }
}

// ── startLiveSession ─────────────────────────────────────────────────────────
// Provider-only. Booking must be in `confirmed` and we must be within ±2h of
// serviceAt. Creates booking_live_sessions/{bookingId} with status=active.

export const startLiveSession = functions.https.onRequest(async (req, res) => {
  if (setupCors(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const caller = await verifyCallerToken(req, res);
  if (!caller) return;

  const { bookingId } = req.body ?? {};
  if (!bookingId || typeof bookingId !== "string") {
    res.status(400).json({ error: "invalid_input" });
    return;
  }

  try {
    let snapshot: admin.firestore.DocumentData | null = null;
    await db.runTransaction(async (tx) => {
      const bookingRef = db.collection("bookings").doc(bookingId);
      const sessionRef = db.collection("booking_live_sessions").doc(bookingId);

      const [bookingSnap, sessionSnap] = await Promise.all([
        tx.get(bookingRef),
        tx.get(sessionRef),
      ]);

      if (!bookingSnap.exists) {
        const e = new Error("booking_not_found"); (e as any).code = "booking_not_found"; throw e;
      }
      const b = bookingSnap.data()!;
      if (b.providerId !== caller.uid) {
        const e = new Error("forbidden"); (e as any).code = "forbidden"; throw e;
      }
      if (b.status !== "confirmed") {
        const e = new Error("booking_not_active"); (e as any).code = "booking_not_active"; throw e;
      }

      const serviceAtMs = b.serviceAt?.toMillis?.() ?? 0;
      const now = Date.now();
      if (Math.abs(now - serviceAtMs) > START_WINDOW_MS) {
        const e = new Error("outside_window"); (e as any).code = "outside_window"; throw e;
      }

      // Idempotent: if a session already exists and is active/paused, return it.
      if (sessionSnap.exists) {
        const existing = sessionSnap.data()!;
        if (existing.status === "ended") {
          const e = new Error("session_already_ended"); (e as any).code = "session_already_ended"; throw e;
        }
        snapshot = { id: bookingId, ...existing };
        return;
      }

      const ts = admin.firestore.Timestamp.now();
      const data = {
        bookingId,
        ownerId: b.ownerId,
        providerId: b.providerId,
        status: "active",
        startedAt: ts,
        endedAt: null,
        lastPing: ts,
        photoCount: 0,
      };
      tx.set(sessionRef, data);
      snapshot = { id: bookingId, ...data };
    });

    // Best-effort notify the owner
    if (snapshot && (snapshot as any).ownerId) {
      const ownerId = (snapshot as any).ownerId as string;
      await notifyByPush(ownerId, {
        title: "Tu cuidador empezó el servicio",
        body: "Sigue el paseo en vivo desde la app.",
        data: { type: "live_session_started", bookingId },
      });
    }

    res.status(200).json({ success: true, session: snapshot });
  } catch (err: any) {
    const code = err?.code ?? "unknown";
    functions.logger.warn("startLiveSession rejected", { bookingId, callerUid: caller.uid, code });
    res.status(400).json({ error: code });
  }
});

// ── endLiveSession ───────────────────────────────────────────────────────────

export const endLiveSession = functions.https.onRequest(async (req, res) => {
  if (setupCors(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const caller = await verifyCallerToken(req, res);
  if (!caller) return;

  const { bookingId } = req.body ?? {};
  if (!bookingId || typeof bookingId !== "string") {
    res.status(400).json({ error: "invalid_input" });
    return;
  }

  try {
    let ownerId: string | null = null;
    let alreadyEnded = false;
    await db.runTransaction(async (tx) => {
      const sessionRef = db.collection("booking_live_sessions").doc(bookingId);
      const snap = await tx.get(sessionRef);
      if (!snap.exists) {
        const e = new Error("session_not_found"); (e as any).code = "session_not_found"; throw e;
      }
      const s = snap.data()!;
      if (s.providerId !== caller.uid && s.ownerId !== caller.uid) {
        const e = new Error("forbidden"); (e as any).code = "forbidden"; throw e;
      }
      ownerId = s.ownerId;
      if (s.status === "ended") { alreadyEnded = true; return; }
      tx.update(sessionRef, {
        status: "ended",
        endedAt: admin.firestore.Timestamp.now(),
      });
    });

    // After commit, snap the last GPS point to a coarse grid so the polyline
    // doesn't end exactly at the provider's home. Skip if the session was
    // already ended (we already anonymized on the first end).
    if (!alreadyEnded) {
      await anonymizeLastPathPoint(bookingId);
    }

    if (ownerId && ownerId !== caller.uid) {
      await notifyByPush(ownerId, {
        title: "Servicio finalizado",
        body: "Puedes revisar las fotos y dejar una reseña al provider.",
        data: { type: "live_session_ended", bookingId },
      });
    }

    res.status(200).json({ success: true });
  } catch (err: any) {
    const code = err?.code ?? "unknown";
    functions.logger.warn("endLiveSession rejected", { bookingId, callerUid: caller.uid, code });
    res.status(400).json({ error: code });
  }
});

// ── pruneStaleLiveSessions ──────────────────────────────────────────────────
// Cron every 30 min. Sessions whose lastPing is older than STALE_PING_MS get
// marked ended. Protects against provider closing the app or losing network.

export const pruneStaleLiveSessions = functions.pubsub
  .schedule("every 30 minutes")
  .onRun(async () => {
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - STALE_PING_MS);
    const snap = await db.collection("booking_live_sessions")
      .where("status", "==", "active")
      .where("lastPing", "<=", cutoff)
      .limit(200)
      .get();

    if (snap.empty) {
      functions.logger.info("pruneStaleLiveSessions: nothing to do");
      return;
    }

    const batch = db.batch();
    const ownerIds: string[] = [];
    const bookingIds: string[] = [];
    snap.docs.forEach((d) => {
      batch.update(d.ref, {
        status: "ended",
        endedAt: admin.firestore.Timestamp.now(),
      });
      ownerIds.push(d.data().ownerId);
      bookingIds.push(d.id);
    });
    await batch.commit();

    // Anonymize the last GPS point of each ended session (best-effort, in
    // parallel). Same privacy reason as endLiveSession: hide provider's home.
    await Promise.allSettled(bookingIds.map((id) => anonymizeLastPathPoint(id)));

    functions.logger.info("pruneStaleLiveSessions ended", { count: snap.size });

    // Best-effort fan-out: notify each owner the session was auto-ended so
    // they don't keep the screen open waiting for updates.
    await Promise.allSettled(
      ownerIds.map((ownerId) =>
        notifyByPush(ownerId, {
          title: "Servicio finalizado",
          body: "Tu cuidador cerró la app — puedes revisar las fotos guardadas.",
          data: { type: "live_session_auto_ended" },
        })
      ),
    );
  });
