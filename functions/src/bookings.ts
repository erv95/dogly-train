import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { db } from "./_shared";
import { sendPush, sendSystemMessage } from "./notifications";

// ── Constants (mirror src/config/booking.ts) ─────────────────────────────────
const BOOKING_TIMEZONE = "Europe/Madrid";
const SLOT_MINUTES = 30;
const SLOT_MS = SLOT_MINUTES * 60 * 1000;
const NOTES_MAX = 280;
const ALLOWED_DURATIONS = new Set([30, 60, 90, 120]);
const ALLOWED_SERVICES = new Set([
  "training", "walk", "day_care", "overnight", "home_care",
]);

// ── Pure helpers ─────────────────────────────────────────────────────────────

interface MadridParts {
  year: number; month: number; day: number;
  hour: number; minute: number;
  /** 0 = Monday, 6 = Sunday. */
  dayIndex: number;
  isoDate: string;
}

function madridParts(d: Date): MadridParts {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: BOOKING_TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    weekday: "short",
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const year = parseInt(get("year"), 10);
  const month = parseInt(get("month"), 10);
  const day = parseInt(get("day"), 10);
  const hour = parseInt(get("hour"), 10);
  const minute = parseInt(get("minute"), 10);
  const wk = get("weekday");
  const map: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const dayIndex = map[wk] ?? 0;
  const isoDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { year, month, day, hour, minute, dayIndex, isoDate };
}

function slotIdsForRange(startUtcMillis: number, minutes: number): string[] {
  const count = Math.ceil(minutes / SLOT_MINUTES);
  const start = Math.floor(startUtcMillis / SLOT_MS);
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(String(start + i));
  return out;
}

interface AvailabilityWindow { startMin: number; endMin: number; }
interface AvailabilityException {
  date: string; blocked: boolean; windows?: AvailabilityWindow[];
}
interface WeeklyAvailability {
  weekly: { dayIndex: number; windows: AvailabilityWindow[] }[];
  exceptions: AvailabilityException[];
  minLeadMinutes: number;
  maxHorizonDays: number;
}

function windowsForDate(
  availability: WeeklyAvailability,
  isoDate: string,
  dayIndex: number,
): AvailabilityWindow[] {
  const ex = availability.exceptions.find((e) => e.date === isoDate);
  if (ex) {
    if (ex.blocked) return [];
    return ex.windows ?? [];
  }
  return availability.weekly.find((w) => w.dayIndex === dayIndex)?.windows ?? [];
}

/** Returns true if every slot covered by [serviceAt, serviceAt + minutes) lies
 *  inside an open window of the corresponding Madrid date(s). Multi-day spans
 *  are checked per their own Madrid date (e.g. an overnight 22:00→02:00 will
 *  fail because the window of the next day is checked separately). */
function slotsFitInWindows(
  serviceAt: Date,
  durationMinutes: number,
  availability: WeeklyAvailability,
): boolean {
  const slotCount = Math.ceil(durationMinutes / SLOT_MINUTES);
  for (let i = 0; i < slotCount; i++) {
    const slotStart = new Date(serviceAt.getTime() + i * SLOT_MS);
    const slotEnd = new Date(slotStart.getTime() + SLOT_MS);
    const startParts = madridParts(slotStart);
    const endParts = madridParts(slotEnd);
    const windows = windowsForDate(availability, startParts.isoDate, startParts.dayIndex);
    const slotStartMin = startParts.hour * 60 + startParts.minute;
    // If slot end falls exactly at midnight, that's fine — endMin clamps to 24*60.
    const slotEndMin = startParts.isoDate === endParts.isoDate
      ? endParts.hour * 60 + endParts.minute
      : 24 * 60;
    const fits = windows.some((w) => w.startMin <= slotStartMin && slotEndMin <= w.endMin);
    if (!fits) return false;
  }
  return true;
}

// ── Pricing ──────────────────────────────────────────────────────────────────

function priceEurInfoFor(
  providerData: Record<string, unknown>,
  service: string,
  durationMinutes: number,
): number {
  const role = providerData.role as string | undefined;
  const hours = durationMinutes / 60;
  if (role === "trainer") {
    const base = Number(providerData.pricePerSession) || 0;
    return Math.round(base * hours);
  }
  if (role === "caretaker") {
    const pricing = (providerData.pricing ?? {}) as Record<string, number | undefined>;
    const map: Record<string, string> = {
      walk: "walk", day_care: "dayCare", overnight: "overnight", home_care: "homeCare",
    };
    const key = map[service];
    const base = key ? Number(pricing[key]) || 0 : 0;
    // Walks scale by the hour; overnight is per night (treat duration ~720 as 1×).
    if (service === "overnight") return base;
    return Math.round(base * hours);
  }
  return 0;
}

// ── Main: createBooking ──────────────────────────────────────────────────────

export const createBooking = functions
  .runWith({ memory: "512MB", timeoutSeconds: 30 })
  .https.onRequest(async (req, res) => {
    const allowedOrigin = process.env.APP_ORIGIN ?? "https://dogly-train.web.app";
    res.set("Access-Control-Allow-Origin", allowedOrigin);
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Methods", "POST");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "method_not_allowed" });
      return;
    }

    // Verify Firebase ID token → uid is the owner.
    const authHeader = req.headers.authorization ?? "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!idToken) { res.status(401).json({ error: "unauthenticated" }); return; }
    let ownerUid: string;
    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      ownerUid = decoded.uid;
    } catch {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }

    // Validate body
    const { providerId, dogId, service, serviceAt, durationMinutes, notes } = req.body ?? {};
    if (
      !providerId || typeof providerId !== "string"
      || !dogId || typeof dogId !== "string"
      || !service || !ALLOWED_SERVICES.has(service)
      || !serviceAt || typeof serviceAt !== "string"
      || !ALLOWED_DURATIONS.has(durationMinutes)
    ) {
      res.status(400).json({ error: "invalid_input" });
      return;
    }
    const serviceAtDate = new Date(serviceAt);
    if (isNaN(serviceAtDate.getTime())) {
      res.status(400).json({ error: "invalid_input" });
      return;
    }
    // Slot must align to the 30-min grid.
    if (serviceAtDate.getTime() % SLOT_MS !== 0) {
      res.status(400).json({ error: "invalid_input" });
      return;
    }
    const safeNotes = typeof notes === "string" ? notes.slice(0, NOTES_MAX) : "";

    // Rate-limit: 3 attempts / 60s per user (mirrors coins.ts:67-84).
    const rlRef = db.collection("rate_limits").doc(`booking_${ownerUid}`);
    const rlSnap = await rlRef.get();
    const now = Date.now();
    if (rlSnap.exists) {
      const lastAt = rlSnap.data()?.lastAt?.toDate?.()?.getTime?.() ?? 0;
      const count = rlSnap.data()?.count ?? 0;
      if (now - lastAt < 60_000 && count >= 3) {
        res.status(429).json({ error: "rate_limited" });
        return;
      }
      if (now - lastAt >= 60_000) {
        await rlRef.set({ lastAt: admin.firestore.Timestamp.now(), count: 1 });
      } else {
        await rlRef.update({ count: admin.firestore.FieldValue.increment(1) });
      }
    } else {
      await rlRef.set({ lastAt: admin.firestore.Timestamp.now(), count: 1 });
    }

    // Compute slot ids
    const slotIds = slotIdsForRange(serviceAtDate.getTime(), durationMinutes);

    try {
      const bookingRef = db.collection("bookings").doc();
      const newId = bookingRef.id;

      await db.runTransaction(async (tx) => {
        // --- READS ---
        const providerRef = db.collection("users").doc(providerId);
        const dogRef = db.collection("dogs").doc(dogId);
        const ownerRef = db.collection("users").doc(ownerUid);
        const availRef = db.collection("availability").doc(providerId);
        const holdRefs = slotIds.map((sid) =>
          db.collection("availability_holds").doc(`${providerId}_${sid}`),
        );

        const [providerSnap, dogSnap, ownerSnap, availSnap, ...holdSnaps] = await Promise.all([
          tx.get(providerRef),
          tx.get(dogRef),
          tx.get(ownerRef),
          tx.get(availRef),
          ...holdRefs.map((r) => tx.get(r)),
        ]);

        // Provider must be an active marketplace member
        if (!providerSnap.exists) {
          const e = new Error("provider_not_active"); (e as any).code = "provider_not_active"; throw e;
        }
        const providerData = providerSnap.data()!;
        if (
          providerData.status !== "active"
          || providerData.isActive !== true
          || (providerData.role !== "trainer" && providerData.role !== "caretaker")
        ) {
          const e = new Error("provider_not_active"); (e as any).code = "provider_not_active"; throw e;
        }

        // Dog must belong to the owner
        if (!dogSnap.exists) {
          const e = new Error("dog_not_found"); (e as any).code = "dog_not_found"; throw e;
        }
        const dogData = dogSnap.data()!;
        if (dogData.ownerId !== ownerUid) {
          const e = new Error("dog_not_found"); (e as any).code = "dog_not_found"; throw e;
        }

        // Owner must exist (defensive — used to denormalise)
        if (!ownerSnap.exists) {
          const e = new Error("invalid_input"); (e as any).code = "invalid_input"; throw e;
        }
        const ownerData = ownerSnap.data()!;

        // Slot lock check — if any hold exists, somebody else got there first
        if (holdSnaps.some((s) => s.exists)) {
          const e = new Error("slot_taken"); (e as any).code = "slot_taken"; throw e;
        }

        // Availability check
        const availability: WeeklyAvailability = availSnap.exists
          ? (availSnap.data() as WeeklyAvailability)
          : { weekly: [], exceptions: [], minLeadMinutes: 120, maxHorizonDays: 60 };

        // Min lead time
        const minLeadMinutes = availability.minLeadMinutes ?? 120;
        const leadMs = minLeadMinutes * 60 * 1000;
        if (serviceAtDate.getTime() - now < leadMs) {
          const e = new Error("too_close_to_now") as any;
          e.code = "too_close_to_now";
          // Surface the configured minimum so the UI can render a precise hint.
          e.minLeadMinutes = minLeadMinutes;
          throw e;
        }
        // Max horizon
        const maxHorizonDays = availability.maxHorizonDays ?? 60;
        const horizonMs = maxHorizonDays * 24 * 60 * 60 * 1000;
        if (serviceAtDate.getTime() - now > horizonMs) {
          const e = new Error("too_far_in_future") as any;
          e.code = "too_far_in_future";
          e.maxHorizonDays = maxHorizonDays;
          throw e;
        }
        // Slot must fall inside an open window
        if (!slotsFitInWindows(serviceAtDate, durationMinutes, availability)) {
          const e = new Error("slot_outside_availability"); (e as any).code = "slot_outside_availability"; throw e;
        }

        // --- WRITES ---
        const serviceEndAt = new Date(serviceAtDate.getTime() + durationMinutes * 60 * 1000);
        const priceEurInfo = priceEurInfoFor(providerData, service, durationMinutes);

        const bookingDoc = {
          ownerId: ownerUid,
          providerId,
          providerRole: providerData.role as "trainer" | "caretaker",
          providerDisplayName: providerData.displayName ?? "",
          providerPhotoURL: providerData.photoURL ?? null,
          providerBizumPhone: providerData.bizumPhone ?? null,
          ownerDisplayName: ownerData.displayName ?? "",
          ownerPhotoURL: ownerData.photoURL ?? null,
          ownerPhone: ownerData.bizumPhone ?? null,
          dogId,
          dogName: dogData.name ?? "",
          dogPhotoURL: dogData.photoURL ?? null,
          service,
          serviceAt: admin.firestore.Timestamp.fromDate(serviceAtDate),
          serviceEndAt: admin.firestore.Timestamp.fromDate(serviceEndAt),
          durationMinutes,
          slotIds,
          priceEurInfo,
          status: "confirmed",
          ...(safeNotes ? { notes: safeNotes } : {}),
          createdAt: admin.firestore.Timestamp.now(),
          updatedAt: admin.firestore.Timestamp.now(),
        };

        tx.set(bookingRef, bookingDoc);

        // One hold doc per slot — doc id `${providerId}_${slotId}` makes the
        // collision atomic across concurrent transactions.
        for (let i = 0; i < holdRefs.length; i++) {
          tx.set(holdRefs[i], {
            providerId,
            slotId: slotIds[i],
            bookingId: newId,
            createdAt: admin.firestore.Timestamp.now(),
          });
        }

        // Idempotency log
        const transitionRef = db.collection("booking_transitions").doc(`${newId}_create`);
        tx.set(transitionRef, {
          bookingId: newId,
          transition: "create",
          appliedAt: admin.firestore.Timestamp.now(),
          appliedBy: ownerUid,
        });
      });

      functions.logger.info("Booking created", { bookingId: newId, ownerUid, providerId });
      res.status(200).json({ success: true, bookingId: newId });
    } catch (error: any) {
      const code = error?.code ?? "unknown";
      functions.logger.warn("createBooking rejected", { ownerUid, providerId, code, message: error?.message });
      // Pass extra context (lead time, horizon) so the client can render a
      // concrete error like "Reserva con al menos 120 min de antelación".
      const payload: Record<string, unknown> = { error: code };
      if (typeof error?.minLeadMinutes === "number") payload.minLeadMinutes = error.minLeadMinutes;
      if (typeof error?.maxHorizonDays === "number") payload.maxHorizonDays = error.maxHorizonDays;
      res.status(400).json(payload);
    }
  });

// ── getProviderOccupiedSlots ─────────────────────────────────────────────────
// Returns just the slot IDs that are already locked for a given provider in a
// UTC range. Server-side admin query — bypasses the Firestore rule that
// prevents non-participants from reading other people's bookings. Only slot
// IDs are returned (no booking details), so it's safe to expose.

export const getProviderOccupiedSlots = functions.https.onRequest(async (req, res) => {
  if (!setupCors(req, res)) return;
  // Auth required — any authenticated user can see slot IDs since they're
  // just integer offsets (no booking details exposed).
  const authHeader = req.headers.authorization ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) { res.status(401).json({ error: "unauthenticated" }); return; }
  try {
    await admin.auth().verifyIdToken(idToken);
  } catch {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  const { providerId, fromUtcMillis, toUtcMillis } = req.body ?? {};
  if (
    !providerId || typeof providerId !== "string"
    || typeof fromUtcMillis !== "number"
    || typeof toUtcMillis !== "number"
    || toUtcMillis <= fromUtcMillis
    || toUtcMillis - fromUtcMillis > 14 * 24 * 60 * 60 * 1000   // cap: 14 days
  ) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }

  try {
    const snap = await db
      .collection("bookings")
      .where("providerId", "==", providerId)
      .where("serviceAt", ">=", admin.firestore.Timestamp.fromMillis(fromUtcMillis))
      .where("serviceAt", "<", admin.firestore.Timestamp.fromMillis(toUtcMillis))
      .limit(200)
      .get();

    const slotIds = new Set<string>();
    for (const doc of snap.docs) {
      const b = doc.data();
      if (b.status !== "confirmed" && b.status !== "completed") continue;
      const ids: string[] = Array.isArray(b.slotIds) ? b.slotIds : [];
      for (const id of ids) slotIds.add(id);
    }
    res.status(200).json({ success: true, slotIds: Array.from(slotIds) });
  } catch (err: any) {
    functions.logger.error("getProviderOccupiedSlots failed", { err: err?.message });
    res.status(500).json({ error: "lookup_failed" });
  }
});

// ── onBookingCreate: notify provider + welcome system message to owner ───────

export const onBookingCreate = functions.firestore
  .document("bookings/{bookingId}")
  .onCreate(async (snap) => {
    const booking = snap.data();
    if (!booking) return;
    const {
      bookingId = snap.id,
      providerId,
      ownerId,
      providerDisplayName,
      ownerDisplayName,
      dogName,
      providerBizumPhone,
      serviceAt,
    } = { ...booking, bookingId: snap.id } as any;

    // Format the service-at as Madrid time for the push body.
    let when = "";
    try {
      const d: Date = serviceAt?.toDate?.() ?? new Date(serviceAt);
      when = new Intl.DateTimeFormat("es-ES", {
        timeZone: "Europe/Madrid",
        weekday: "short", day: "numeric", month: "short",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).format(d);
    } catch { /* fallback to empty */ }

    // 1. Push to the provider
    try {
      const providerSnap = await db.collection("users").doc(providerId).get();
      if (providerSnap.exists) {
        const { fcmToken, status } = providerSnap.data()!;
        if (fcmToken && status === "active") {
          await sendPush(
            fcmToken,
            "Nueva reserva 🐾",
            `${ownerDisplayName} reservó para ${dogName} · ${when}`,
            { type: "booking_created", bookingId },
            providerId,
          );
        }
      }
    } catch (e) {
      functions.logger.warn("onBookingCreate push to provider failed", e);
    }

    // 2. System message to the owner with payment hint
    try {
      const text = providerBizumPhone
        ? `Reserva confirmada con ${providerDisplayName} (${when}). Paga por Bizum a ${providerBizumPhone}.`
        : `Reserva confirmada con ${providerDisplayName} (${when}). Coordina el pago por chat.`;
      await sendSystemMessage(ownerId, text);
    } catch (e) {
      functions.logger.warn("onBookingCreate system message to owner failed", e);
    }

    // 3. System message to the provider
    try {
      const text = `${ownerDisplayName} ha reservado para ${dogName} · ${when}.`;
      await sendSystemMessage(providerId, text);
    } catch (e) {
      functions.logger.warn("onBookingCreate system message to provider failed", e);
    }
  });

// ── Shared helpers ───────────────────────────────────────────────────────────

function fmtMadrid(d: Date): string {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      timeZone: BOOKING_TIMEZONE,
      weekday: "short", day: "numeric", month: "short",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).format(d);
  } catch {
    return "";
  }
}

async function notifyByPush(
  uid: string,
  title: string,
  body: string,
  data: Record<string, string>,
) {
  try {
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) return;
    const { fcmToken, status } = userSnap.data()!;
    if (fcmToken && status === "active") {
      await sendPush(fcmToken, title, body, data, uid);
    }
  } catch (e) {
    functions.logger.warn("notifyByPush failed", { uid, message: (e as any)?.message });
  }
}

async function verifyBookingCallerToken(req: any): Promise<string | null> {
  const authHeader = req.headers.authorization ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) return null;
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    return decoded.uid;
  } catch {
    return null;
  }
}

function setupCors(req: any, res: any): boolean {
  const allowedOrigin = process.env.APP_ORIGIN ?? "https://dogly-train.web.app";
  res.set("Access-Control-Allow-Origin", allowedOrigin);
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.status(204).send("");
    return false;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return false;
  }
  return true;
}

// ── cancelBooking ────────────────────────────────────────────────────────────

export const cancelBooking = functions
  .runWith({ memory: "512MB", timeoutSeconds: 30 })
  .https.onRequest(async (req, res) => {
    if (!setupCors(req, res)) return;

    const callerUid = await verifyBookingCallerToken(req);
    if (!callerUid) { res.status(401).json({ error: "unauthenticated" }); return; }

    const { bookingId } = req.body ?? {};
    if (!bookingId || typeof bookingId !== "string") {
      res.status(400).json({ error: "invalid_input" });
      return;
    }

    let cancelledBy: "owner" | "provider" | null = null;
    let postState: { booking?: any } = {};

    try {
      await db.runTransaction(async (tx) => {
        const bookingRef = db.collection("bookings").doc(bookingId);
        const transitionRef = db.collection("booking_transitions").doc(`${bookingId}_cancel`);

        const [bookingSnap, transitionSnap] = await Promise.all([
          tx.get(bookingRef),
          tx.get(transitionRef),
        ]);

        if (!bookingSnap.exists) {
          const e = new Error("booking_not_found"); (e as any).code = "booking_not_found"; throw e;
        }
        const booking = bookingSnap.data()!;
        postState.booking = booking;

        // Only the owner or provider can cancel
        if (callerUid !== booking.ownerId && callerUid !== booking.providerId) {
          const e = new Error("forbidden"); (e as any).code = "forbidden"; throw e;
        }

        // Idempotent: if already cancelled, return success without doing anything.
        if (transitionSnap.exists) return;

        // Only confirmed bookings can be cancelled
        if (booking.status !== "confirmed") {
          const e = new Error("not_cancellable"); (e as any).code = "not_cancellable"; throw e;
        }

        cancelledBy = callerUid === booking.ownerId ? "owner" : "provider";
        const now = admin.firestore.Timestamp.now();
        const newStatus = cancelledBy === "owner"
          ? "cancelled_by_owner"
          : "cancelled_by_provider";

        // Update booking
        tx.update(bookingRef, {
          status: newStatus,
          cancelledAt: now,
          cancelledBy,
          updatedAt: now,
        });

        // Free the slot locks so the same slots become available again
        const slotIds: string[] = booking.slotIds ?? [];
        for (const sid of slotIds) {
          const holdRef = db.collection("availability_holds").doc(`${booking.providerId}_${sid}`);
          tx.delete(holdRef);
        }

        // Idempotency log
        tx.set(transitionRef, {
          bookingId,
          transition: "cancel",
          appliedAt: now,
          appliedBy: callerUid,
          cancelledBy,
        });
      });
    } catch (error: any) {
      const code = error?.code ?? "unknown";
      functions.logger.warn("cancelBooking rejected", { bookingId, callerUid, code });
      res.status(400).json({ error: code });
      return;
    }

    // ── Side-effects after commit (best-effort) ─────────────────────────────
    if (cancelledBy && postState.booking) {
      const b = postState.booking;
      const otherUid = cancelledBy === "owner" ? b.providerId : b.ownerId;
      const cancellerName = cancelledBy === "owner" ? b.ownerDisplayName : b.providerDisplayName;
      const when = fmtMadrid(b.serviceAt?.toDate?.() ?? new Date(b.serviceAt));
      const text = `${cancellerName} canceló la reserva del ${when}.`;
      try { await sendSystemMessage(otherUid, text); }
      catch (e) { functions.logger.warn("cancel system msg failed", e); }
      await notifyByPush(otherUid, "Reserva cancelada", text, {
        type: "booking_cancelled",
        bookingId,
      });
    }

    res.status(200).json({ success: true });
  });

// ── markBookingCompleted ─────────────────────────────────────────────────────

export const markBookingCompleted = functions
  .runWith({ memory: "512MB", timeoutSeconds: 30 })
  .https.onRequest(async (req, res) => {
    if (!setupCors(req, res)) return;

    const callerUid = await verifyBookingCallerToken(req);
    if (!callerUid) { res.status(401).json({ error: "unauthenticated" }); return; }

    const { bookingId, completionPhotoURL } = req.body ?? {};
    if (!bookingId || typeof bookingId !== "string") {
      res.status(400).json({ error: "invalid_input" });
      return;
    }
    // Anti-fraud: provider must attach photo proof of completed service.
    // Either reused from a live session or freshly captured at completion time.
    if (!completionPhotoURL || typeof completionPhotoURL !== "string"
        || !completionPhotoURL.startsWith("https://")) {
      res.status(400).json({ error: "photo_required" });
      return;
    }
    // The URL must point to OUR Storage bucket, under a path scoped to this
    // booking. Without this, a provider could hotlink any image on the web
    // (stock photo, screenshot from another user, etc.) as fake proof.
    try {
      const parsed = new URL(completionPhotoURL);
      if (parsed.hostname !== "firebasestorage.googleapis.com") {
        res.status(400).json({ error: "invalid_photo_url" }); return;
      }
      const allowedPrefixes = [
        `/v0/b/dogly-train-eu/o/booking_completion_photos%2F${bookingId}%2F`,
        `/v0/b/dogly-train-eu/o/live-sessions%2F${bookingId}%2F`,
      ];
      if (!allowedPrefixes.some((p) => parsed.pathname.startsWith(p))) {
        res.status(400).json({ error: "invalid_photo_url" }); return;
      }
    } catch {
      res.status(400).json({ error: "invalid_photo_url" }); return;
    }

    let postState: { booking?: any; alreadyDone?: boolean } = {};

    try {
      await db.runTransaction(async (tx) => {
        const bookingRef = db.collection("bookings").doc(bookingId);
        const transitionRef = db.collection("booking_transitions").doc(`${bookingId}_complete`);

        const [bookingSnap, transitionSnap] = await Promise.all([
          tx.get(bookingRef),
          tx.get(transitionRef),
        ]);

        if (!bookingSnap.exists) {
          const e = new Error("booking_not_found"); (e as any).code = "booking_not_found"; throw e;
        }
        const booking = bookingSnap.data()!;
        postState.booking = booking;

        // Only the provider can mark completed
        if (callerUid !== booking.providerId) {
          const e = new Error("forbidden"); (e as any).code = "forbidden"; throw e;
        }

        // Idempotent: already completed → no-op
        if (transitionSnap.exists) {
          postState.alreadyDone = true;
          return;
        }

        if (booking.status !== "confirmed") {
          const e = new Error("not_completable"); (e as any).code = "not_completable"; throw e;
        }

        // Provider can mark completed any time from serviceAt onward. The
        // previous gate (endMs - 1h) forced them to wait until 30 minutes
        // before the end, so a provider finishing a 30-min walk before the
        // scheduled end couldn't close the booking — bad UX. The cron
        // `autoCompleteScheduled` still expires untouched bookings 2h after
        // serviceEndAt, so there's no race with auto-expiry under normal use.
        const startMs = (booking.serviceAt?.toMillis?.() ?? new Date(booking.serviceAt).getTime()) || 0;
        if (Date.now() < startMs) {
          const e = new Error("too_early"); (e as any).code = "too_early"; throw e;
        }

        const now = admin.firestore.Timestamp.now();
        tx.update(bookingRef, {
          status: "completed",
          completedAt: now,
          completionPhotoURL,
          completionPhotoTakenAt: now,
          updatedAt: now,
        });
        tx.set(transitionRef, {
          bookingId,
          transition: "complete",
          appliedAt: now,
          appliedBy: callerUid,
        });
      });
    } catch (error: any) {
      const code = error?.code ?? "unknown";
      functions.logger.warn("markBookingCompleted rejected", { bookingId, callerUid, code });
      res.status(400).json({ error: code });
      return;
    }

    // Side-effects: invite the owner to leave a review (only on the first call)
    if (postState.booking && !postState.alreadyDone) {
      const b = postState.booking;
      const reviewLink = `dogly://review/${b.providerId}`;
      const text = `${b.providerDisplayName} marcó la reserva como completada. ¡Comparte tu reseña! ${reviewLink}`;
      try { await sendSystemMessage(b.ownerId, text); }
      catch (e) { functions.logger.warn("complete system msg failed", e); }
      await notifyByPush(b.ownerId, "¿Cómo fue?", `Deja una reseña a ${b.providerDisplayName}`, {
        type: "booking_completed",
        bookingId,
        providerId: b.providerId,
      });

      // Referral claim — fire-and-forget, never blocks the caller. Internally
      // verifies email + first-completed-booking + cap before granting. Always
      // log the outcome so we can debug why a claim didn't fire.
      try {
        const { maybeClaimReferralOnFirstBookingComplete } = await import("./referrals");
        const result = await maybeClaimReferralOnFirstBookingComplete(b.ownerId);
        functions.logger.info("referral claim attempt", {
          ownerId: b.ownerId,
          claimed: result.claimed,
          reason: result.reason ?? null,
        });
      } catch (e: any) {
        functions.logger.warn("referral claim attempt failed", { err: e?.message });
      }
    }

    res.status(200).json({ success: true });
  });

// ── autoCompleteScheduled ───────────────────────────────────────────────────
// Hourly cron. Any booking still in `confirmed` 2 hours after its end time
// gets marked as `expired` (no-show): slot holds released, both parties
// notified. Provider can still mark it completed within those 2h grace.
//
// Note: name kept for deploy-stability — actual semantic is "auto-expire".

const EXPIRE_GRACE_HOURS = 2;

export const autoCompleteScheduled = functions.pubsub
  .schedule("every 1 hours")
  .onRun(async () => {
    const cutoff = admin.firestore.Timestamp.fromMillis(
      Date.now() - EXPIRE_GRACE_HOURS * 60 * 60 * 1000,
    );

    const snap = await db
      .collection("bookings")
      .where("status", "==", "confirmed")
      .where("serviceEndAt", "<=", cutoff)
      .limit(200)
      .get();

    if (snap.empty) {
      functions.logger.info("autoCompleteScheduled: nothing to expire");
      return;
    }

    let processed = 0;
    for (const docSnap of snap.docs) {
      const bookingId = docSnap.id;
      try {
        let alreadyDone = false;
        let booking: any = null;

        await db.runTransaction(async (tx) => {
          const bookingRef = db.collection("bookings").doc(bookingId);
          const expireRef = db.collection("booking_transitions").doc(`${bookingId}_expire`);
          const completeRef = db.collection("booking_transitions").doc(`${bookingId}_complete`);

          const [bSnap, eSnap, cSnap] = await Promise.all([
            tx.get(bookingRef),
            tx.get(expireRef),
            tx.get(completeRef),
          ]);

          if (!bSnap.exists) return;
          booking = bSnap.data();
          if (booking.status !== "confirmed") return;
          // Idempotency: already expired or manually completed → skip
          if (eSnap.exists || cSnap.exists) { alreadyDone = true; return; }

          const now = admin.firestore.Timestamp.now();
          tx.update(bookingRef, {
            status: "expired",
            cancelledAt: now,
            cancelledBy: "system",
            updatedAt: now,
          });
          // Free up the slot holds so the provider's calendar reopens
          const slotIds: string[] = Array.isArray(booking.slotIds) ? booking.slotIds : [];
          for (const sid of slotIds) {
            tx.delete(db.collection("availability_holds").doc(`${booking.providerId}_${sid}`));
          }
          tx.set(expireRef, {
            bookingId,
            transition: "expire",
            appliedAt: now,
            appliedBy: "system",
          });
        });

        if (booking && !alreadyDone) {
          const date = booking.serviceAt?.toDate?.() ?? null;
          const dateLabel = date
            ? date.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "long" })
            : "";
          const ownerMsg = `Tu reserva${dateLabel ? ` del ${dateLabel}` : ""} con ${booking.providerDisplayName} ha caducado porque no se completó a tiempo.`;
          const providerMsg = `Tu reserva${dateLabel ? ` del ${dateLabel}` : ""} con ${booking.ownerDisplayName} ha caducado porque no se marcó como completada.`;
          // Best-effort fan-out — never fails the cron loop
          await Promise.allSettled([
            sendSystemMessage(booking.ownerId, ownerMsg),
            sendSystemMessage(booking.providerId, providerMsg),
            notifyByPush(booking.ownerId, "Reserva caducada", ownerMsg, {
              type: "booking_expired", bookingId,
            }),
            notifyByPush(booking.providerId, "Reserva caducada", providerMsg, {
              type: "booking_expired", bookingId,
            }),
          ]);
        }
        processed++;
      } catch (e: any) {
        functions.logger.error("autoExpire failed for booking", { bookingId, message: e?.message });
      }
    }

    functions.logger.info("autoCompleteScheduled (expire) processed", { processed, total: snap.size });
  });

// ── sendBookingReminders ─────────────────────────────────────────────────────
// Every 10 minutes, push a reminder to both parties for any booking starting
// in 50–70 minutes. Idempotent via `booking_transitions/{id}_reminder_1h`.

export const sendBookingReminders = functions.pubsub
  .schedule("every 10 minutes")
  .onRun(async () => {
    const now = Date.now();
    const lower = admin.firestore.Timestamp.fromMillis(now + 50 * 60 * 1000);
    const upper = admin.firestore.Timestamp.fromMillis(now + 70 * 60 * 1000);

    const snap = await db
      .collection("bookings")
      .where("status", "==", "confirmed")
      .where("serviceAt", ">=", lower)
      .where("serviceAt", "<=", upper)
      .limit(500)
      .get();

    if (snap.empty) {
      functions.logger.info("sendBookingReminders: no bookings in window");
      return;
    }

    let sent = 0;
    for (const docSnap of snap.docs) {
      const bookingId = docSnap.id;
      const booking = docSnap.data();
      try {
        // Idempotency check: write the transition doc atomically. If create
        // fails because it already exists, this booking was already reminded.
        const transitionRef = db.collection("booking_transitions").doc(`${bookingId}_reminder_1h`);
        const wasNew = await db.runTransaction(async (tx) => {
          const tSnap = await tx.get(transitionRef);
          if (tSnap.exists) return false;
          tx.set(transitionRef, {
            bookingId,
            transition: "reminder_1h",
            appliedAt: admin.firestore.Timestamp.now(),
            appliedBy: "system",
          });
          return true;
        });
        if (!wasNew) continue;

        // Compute the human-readable time once for the body
        const when = fmtMadrid(booking.serviceAt?.toDate?.() ?? new Date(booking.serviceAt));

        // Push to owner
        const ownerBody = `Tu cita con ${booking.providerDisplayName} es en 1 hora · ${when}`;
        await notifyByPush(booking.ownerId, "Recordatorio 🐾", ownerBody, {
          type: "booking_reminder_1h",
          bookingId,
        });

        // Push to provider
        const providerBody = `Tu reserva con ${booking.ownerDisplayName} (${booking.dogName}) es en 1 hora · ${when}`;
        await notifyByPush(booking.providerId, "Recordatorio 🐾", providerBody, {
          type: "booking_reminder_1h",
          bookingId,
        });

        sent++;
      } catch (e: any) {
        functions.logger.error("sendBookingReminders failed for booking", {
          bookingId, message: e?.message,
        });
      }
    }

    functions.logger.info("sendBookingReminders done", { sent, scanned: snap.size });
  });
