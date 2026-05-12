import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {
  db,
  setupCors,
  verifyCallerToken,
  enforceRateLimit,
  notifyByPush,
} from "./_shared";

const VALID_REASONS = new Set([
  "no_show",
  "poor_service",
  "safety_concern",
  "payment_issue",
  "inappropriate_behavior",
  "other",
]);

const MAX_DESCRIPTION = 1000;

/**
 * File a dispute on a booking. Either participant can open one. The doc lives
 * in `disputes/` and is admin-resolvable. Both sides can read it from then on.
 *
 * Idempotent per (booking, opener) pair: re-filing returns the existing
 * dispute id instead of creating a duplicate. Use admin tools to close + the
 * user re-opens with a separate description if they need to.
 */
export const openDispute = functions.https.onRequest(async (req, res) => {
  if (setupCors(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const caller = await verifyCallerToken(req, res);
  if (!caller) return;

  const { bookingId, reason, description } = req.body ?? {};

  if (!bookingId || typeof bookingId !== "string") {
    res.status(400).json({ error: "invalid_bookingId" });
    return;
  }
  if (typeof reason !== "string" || !VALID_REASONS.has(reason)) {
    res.status(400).json({ error: "invalid_reason" });
    return;
  }
  if (typeof description !== "string" || description.trim().length < 5
      || description.length > MAX_DESCRIPTION) {
    res.status(400).json({ error: "invalid_description" });
    return;
  }

  // 5 disputes / 24h per user — guard against vexatious filings.
  if (!(await enforceRateLimit(res, `dispute_${caller.uid}`, 5, 86400))) return;

  try {
    const bookingRef = db.collection("bookings").doc(bookingId);
    const bookingSnap = await bookingRef.get();
    if (!bookingSnap.exists) {
      res.status(404).json({ error: "booking_not_found" });
      return;
    }
    const b = bookingSnap.data()!;
    if (b.ownerId !== caller.uid && b.providerId !== caller.uid) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    // Deterministic id = booking + opener, so re-tapping the button doesn't
    // duplicate.
    const disputeId = `${bookingId}_${caller.uid}`;
    const ref = db.collection("disputes").doc(disputeId);

    const existing = await ref.get();
    if (existing.exists) {
      res.status(200).json({ success: true, disputeId, alreadyOpen: true });
      return;
    }

    const data = {
      bookingId,
      ownerId: b.ownerId,
      providerId: b.providerId,
      openedBy: caller.uid,
      reason,
      description: description.trim(),
      status: "open",
      createdAt: admin.firestore.Timestamp.now(),
      resolvedAt: null,
      resolvedBy: null,
      resolution: null,
    };
    await ref.set(data);

    // Notify the OTHER participant so they aren't blindsided.
    const otherId = caller.uid === b.ownerId ? b.providerId : b.ownerId;
    if (otherId) {
      await notifyByPush(otherId, {
        title: "Reclamación abierta",
        body: "La otra parte ha abierto una reclamación sobre vuestro servicio. La revisaremos.",
        data: { type: "dispute_opened", disputeId, bookingId },
      });
    }

    // Audit log for the admin dashboard.
    await db.collection("security_events").add({
      userId: caller.uid,
      type: "dispute_opened",
      disputeId,
      bookingId,
      createdAt: admin.firestore.Timestamp.now(),
    });

    functions.logger.info("Dispute opened", { disputeId, opener: caller.uid });
    res.status(200).json({ success: true, disputeId });
  } catch (err: any) {
    functions.logger.error("openDispute failed", { uid: caller.uid, err: err?.message });
    res.status(500).json({ error: "open_failed" });
  }
});

/**
 * Admin closes / rejects a dispute and writes a short resolution note that
 * both parties can read.
 */
export const adminResolveDispute = functions.https.onRequest(async (req, res) => {
  if (setupCors(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const caller = await verifyCallerToken(req, res);
  if (!caller) return;
  if (!caller.isAdmin) {
    res.status(403).json({ error: "admin_only" });
    return;
  }

  const { disputeId, status, resolution } = req.body ?? {};
  if (!disputeId || typeof disputeId !== "string") {
    res.status(400).json({ error: "invalid_disputeId" });
    return;
  }
  if (status !== "resolved" && status !== "rejected") {
    res.status(400).json({ error: "invalid_status" });
    return;
  }
  if (typeof resolution !== "string" || resolution.length > 500) {
    res.status(400).json({ error: "invalid_resolution" });
    return;
  }

  try {
    const ref = db.collection("disputes").doc(disputeId);
    const snap = await ref.get();
    if (!snap.exists) {
      res.status(404).json({ error: "dispute_not_found" });
      return;
    }
    const d = snap.data()!;
    if (d.status !== "open") {
      res.status(400).json({ error: "already_closed" });
      return;
    }

    await ref.update({
      status,
      resolution: resolution.trim() || null,
      resolvedAt: admin.firestore.Timestamp.now(),
      resolvedBy: caller.uid,
    });

    // Notify both parties
    const title = status === "resolved"
      ? "Reclamación resuelta"
      : "Reclamación cerrada";
    const body = "Puedes ver el resultado y la nota del moderador en tu reserva.";
    await Promise.allSettled([
      notifyByPush(d.ownerId, { title, body, data: { type: "dispute_closed", disputeId } }),
      notifyByPush(d.providerId, { title, body, data: { type: "dispute_closed", disputeId } }),
    ]);

    functions.logger.info("Dispute resolved", { disputeId, status, admin: caller.uid });
    res.status(200).json({ success: true });
  } catch (err: any) {
    functions.logger.error("adminResolveDispute failed", { err: err?.message });
    res.status(500).json({ error: "resolve_failed" });
  }
});
