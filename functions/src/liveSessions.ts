import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {
  setupCors,
  verifyCallerToken,
  notifyByPush,
} from "./_shared";

const db = admin.firestore();

const START_WINDOW_MS = 2 * 60 * 60 * 1000;   // ±2h around serviceAt
const STALE_PING_MS = 30 * 60 * 1000;          // 30 min no ping → mark ended

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
      if (s.status === "ended") return; // idempotent
      tx.update(sessionRef, {
        status: "ended",
        endedAt: admin.firestore.Timestamp.now(),
      });
    });

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
    snap.docs.forEach((d) => {
      batch.update(d.ref, {
        status: "ended",
        endedAt: admin.firestore.Timestamp.now(),
      });
      ownerIds.push(d.data().ownerId);
    });
    await batch.commit();

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
