import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {
  db,
  setupCors,
  verifyCallerToken,
  enforceRateLimit,
} from "./_shared";

const BOOKING_TIMEZONE = "Europe/Madrid";
const SLOT_MINUTES = 30;
const SLOT_MS = SLOT_MINUTES * 60 * 1000;
const NOTES_MAX = 280;
const ALLOWED_DURATIONS = new Set([30, 60, 90, 120]);
const ALLOWED_SERVICES = new Set([
  "training", "walk", "day_care", "overnight", "home_care",
]);

const MAX_WEEKS = 12;
// 1 = single occurrence wrapped in a series. Useful for caretakers whose
// shortest valid recurring is "1 week of weekly walks".
const MIN_WEEKS = 1;

// ── DST-safe local-time helpers (mirror bookings.ts) ─────────────────────────

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

/** Resolve a Madrid local date+hour+minute to its UTC instant. Implementation:
 *  start with a naive UTC guess, ask Intl what wall-clock that yields in Madrid,
 *  and shift by the offset. DST-safe in Node 20 across both March and October
 *  transitions (worst case 1 iteration of correction). */
function madridLocalToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  for (let i = 0; i < 3; i++) {
    const parts = madridParts(new Date(guess));
    const dy = parts.year - year;
    const dm = parts.month - month;
    const dd = parts.day - day;
    const dh = parts.hour - hour;
    const dmin = parts.minute - minute;
    const offsetMin = dy * 525600 + dm * 43200 + dd * 1440 + dh * 60 + dmin;
    if (offsetMin === 0) return new Date(guess);
    guess -= offsetMin * 60_000;
  }
  return new Date(guess);
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

function windowsForDate(av: WeeklyAvailability, isoDate: string, dayIndex: number): AvailabilityWindow[] {
  const ex = av.exceptions.find((e) => e.date === isoDate);
  if (ex) {
    if (ex.blocked) return [];
    return ex.windows ?? [];
  }
  return av.weekly.find((w) => w.dayIndex === dayIndex)?.windows ?? [];
}

function slotsFitInWindows(serviceAt: Date, durationMinutes: number, availability: WeeklyAvailability): boolean {
  const slotCount = Math.ceil(durationMinutes / SLOT_MINUTES);
  for (let i = 0; i < slotCount; i++) {
    const slotStart = new Date(serviceAt.getTime() + i * SLOT_MS);
    const slotEnd = new Date(slotStart.getTime() + SLOT_MS);
    const startParts = madridParts(slotStart);
    const endParts = madridParts(slotEnd);
    const windows = windowsForDate(availability, startParts.isoDate, startParts.dayIndex);
    const slotStartMin = startParts.hour * 60 + startParts.minute;
    const slotEndMin = startParts.isoDate === endParts.isoDate
      ? endParts.hour * 60 + endParts.minute
      : 24 * 60;
    const fits = windows.some((w) => w.startMin <= slotStartMin && slotEndMin <= w.endMin);
    if (!fits) return false;
  }
  return true;
}

function priceEurInfoFor(providerData: Record<string, unknown>, service: string, durationMinutes: number): number {
  const role = providerData.role as string | undefined;
  const hours = durationMinutes / 60;
  if (role === "trainer") {
    return Math.round((Number(providerData.pricePerSession) || 0) * hours);
  }
  if (role === "caretaker") {
    const pricing = (providerData.pricing ?? {}) as Record<string, number | undefined>;
    const map: Record<string, string> = {
      walk: "walk", day_care: "dayCare", overnight: "overnight", home_care: "homeCare",
    };
    const key = map[service];
    const base = key ? Number(pricing[key]) || 0 : 0;
    if (service === "overnight") return base;
    return Math.round(base * hours);
  }
  return 0;
}

// ── Per-occurrence status used by both preview and create ───────────────────

type OccurrenceStatus =
  | "available"
  | "taken"
  | "outside_windows"
  | "too_far"
  | "too_close"
  | "blocked";

interface OccurrenceAnalysis {
  index: number;
  serviceAt: string;          // ISO UTC, easy for the client to render in Madrid
  status: OccurrenceStatus;
}

/** Pure validation that builds the per-occurrence status array given already-fetched
 *  reference data. Used by both preview and create — keeps the rules in one place. */
function analyzeOccurrences(args: {
  occurrences: Date[];
  slotsByOccurrence: string[][];
  holdsExistByOccurrence: boolean[];   // already aggregated per occurrence
  availability: WeeklyAvailability;
  durationMinutes: number;
  nowMs: number;
}): OccurrenceAnalysis[] {
  const { occurrences, holdsExistByOccurrence, availability, durationMinutes, nowMs } = args;
  const leadMs = (availability.minLeadMinutes ?? 120) * 60 * 1000;
  const horizonMs = (availability.maxHorizonDays ?? 60) * 24 * 60 * 60 * 1000;

  return occurrences.map((at, i) => {
    let status: OccurrenceStatus = "available";
    if (at.getTime() - nowMs < leadMs) status = "too_close";
    else if (at.getTime() - nowMs > horizonMs) status = "too_far";
    else if (holdsExistByOccurrence[i]) status = "taken";
    else if (!slotsFitInWindows(at, durationMinutes, availability)) status = "outside_windows";
    return { index: i, serviceAt: at.toISOString(), status };
  });
}

/** Aggregates per-slot hold existence into per-occurrence boolean. */
function aggregateHolds(slotsByOccurrence: string[][], holdSnaps: admin.firestore.DocumentSnapshot[]): boolean[] {
  const out: boolean[] = [];
  let cursor = 0;
  for (const slots of slotsByOccurrence) {
    let anyTaken = false;
    for (let j = 0; j < slots.length; j++) {
      if (holdSnaps[cursor].exists) anyTaken = true;
      cursor++;
    }
    out.push(anyTaken);
  }
  return out;
}

/** Validate the request body shared by preview + create. Returns the parsed
 *  arguments or null (and writes the error) if invalid. */
function parseRecurringBody(req: functions.https.Request, res: functions.Response): null | {
  providerId: string;
  dogId: string;
  service: string;
  firstDate: Date;
  durationMinutes: number;
  weeksCount: number;
  safeNotes: string;
  skipUnavailable: boolean;
} {
  const { providerId, dogId, service, firstSlotAt, durationMinutes, weeksCount, notes, skipUnavailable } = req.body ?? {};
  if (
    !providerId || typeof providerId !== "string"
    || !dogId || typeof dogId !== "string"
    || !service || !ALLOWED_SERVICES.has(service)
    || !firstSlotAt || typeof firstSlotAt !== "string"
    || !ALLOWED_DURATIONS.has(durationMinutes)
    || typeof weeksCount !== "number"
    || weeksCount < MIN_WEEKS || weeksCount > MAX_WEEKS
  ) {
    res.status(400).json({ error: "invalid_input" });
    return null;
  }
  const firstDate = new Date(firstSlotAt);
  if (isNaN(firstDate.getTime()) || firstDate.getTime() % SLOT_MS !== 0) {
    res.status(400).json({ error: "invalid_input" });
    return null;
  }
  return {
    providerId, dogId, service,
    firstDate,
    durationMinutes,
    weeksCount,
    safeNotes: typeof notes === "string" ? notes.slice(0, NOTES_MAX) : "",
    skipUnavailable: skipUnavailable === true,
  };
}

/** Build the array of UTC dates for a weekly recurring series, anchored on the
 *  Madrid wall-clock of the first occurrence (DST-safe). */
function buildOccurrences(firstDate: Date, weeksCount: number): { occurrences: Date[]; firstParts: MadridParts } {
  const firstParts = madridParts(firstDate);
  const occurrences: Date[] = [firstDate];
  for (let n = 1; n < weeksCount; n++) {
    const calendarDay = firstParts.day + 7 * n;
    occurrences.push(madridLocalToUtc(
      firstParts.year, firstParts.month, calendarDay, firstParts.hour, firstParts.minute,
    ));
  }
  return { occurrences, firstParts };
}

// ── previewRecurringSeries ───────────────────────────────────────────────────
// Returns the per-occurrence status (available/taken/outside/too_far/too_close)
// without writing anything. Frontend uses this to show a green/red list before
// the user commits to creating the series.

export const previewRecurringSeries = functions
  .runWith({ memory: "256MB", timeoutSeconds: 30 })
  .https.onRequest(async (req, res) => {
    if (setupCors(req, res)) return;
    if (req.method !== "POST") {
      res.status(405).json({ error: "method_not_allowed" });
      return;
    }
    const caller = await verifyCallerToken(req, res);
    if (!caller) return;

    const parsed = parseRecurringBody(req, res);
    if (!parsed) return;
    const { providerId, dogId, durationMinutes, weeksCount, firstDate } = parsed;

    // Light rate limit — preview is read-only but we still don't want to be hammered
    if (!(await enforceRateLimit(res, `recurring_preview_${caller.uid}`, 10, 60))) return;

    try {
      const { occurrences } = buildOccurrences(firstDate, weeksCount);
      const slotsByOccurrence = occurrences.map((d) => slotIdsForRange(d.getTime(), durationMinutes));
      const allHoldRefs = slotsByOccurrence.flatMap((slots) =>
        slots.map((sid) => db.collection("availability_holds").doc(`${providerId}_${sid}`)),
      );

      const [providerSnap, dogSnap, availSnap, ...holdSnaps] = await Promise.all([
        db.collection("users").doc(providerId).get(),
        db.collection("dogs").doc(dogId).get(),
        db.collection("availability").doc(providerId).get(),
        ...allHoldRefs.map((r) => r.get()),
      ]);

      if (!providerSnap.exists || providerSnap.data()?.status !== "active") {
        res.status(400).json({ error: "provider_not_active" });
        return;
      }
      if (!dogSnap.exists || dogSnap.data()?.ownerId !== caller.uid) {
        res.status(400).json({ error: "dog_not_found" });
        return;
      }

      const availability: WeeklyAvailability = availSnap.exists
        ? (availSnap.data() as WeeklyAvailability)
        : { weekly: [], exceptions: [], minLeadMinutes: 120, maxHorizonDays: 60 };

      const holdsExistByOccurrence = aggregateHolds(slotsByOccurrence, holdSnaps);
      const analysis = analyzeOccurrences({
        occurrences,
        slotsByOccurrence,
        holdsExistByOccurrence,
        availability,
        durationMinutes,
        nowMs: Date.now(),
      });

      const availableCount = analysis.filter((a) => a.status === "available").length;
      res.status(200).json({
        success: true,
        occurrences: analysis,
        availableCount,
        unavailableCount: analysis.length - availableCount,
      });
    } catch (err: any) {
      functions.logger.error("previewRecurringSeries failed", { err: err?.message });
      res.status(500).json({ error: "preview_failed" });
    }
  });

// ── createRecurringBookings ──────────────────────────────────────────────────

export const createRecurringBookings = functions
  .runWith({ memory: "512MB", timeoutSeconds: 60 })
  .https.onRequest(async (req, res) => {
    if (setupCors(req, res)) return;
    if (req.method !== "POST") {
      res.status(405).json({ error: "method_not_allowed" });
      return;
    }
    const caller = await verifyCallerToken(req, res);
    if (!caller) return;
    const ownerUid = caller.uid;

    const parsed = parseRecurringBody(req, res);
    if (!parsed) return;
    const { providerId, dogId, service, firstDate, durationMinutes, weeksCount, safeNotes, skipUnavailable } = parsed;

    if (!(await enforceRateLimit(res, `recurring_${ownerUid}`, 3, 60))) return;

    const { occurrences, firstParts } = buildOccurrences(firstDate, weeksCount);
    let failedAtIndex: number | null = null;
    let returnedSkipped: OccurrenceAnalysis[] = [];

    try {
      // Pre-allocate the series doc id and one booking id per occurrence.
      const seriesRef = db.collection("recurring_series").doc();
      const seriesId = seriesRef.id;
      const bookingRefs = occurrences.map(() => db.collection("bookings").doc());
      const bookingIds = bookingRefs.map((r) => r.id);

      // Build the list of all slot ids and corresponding hold doc refs
      const slotsByOccurrence = occurrences.map((d) => slotIdsForRange(d.getTime(), durationMinutes));
      const allHoldRefs = slotsByOccurrence.flatMap((slots) =>
        slots.map((sid) => db.collection("availability_holds").doc(`${providerId}_${sid}`)),
      );

      const createdBookingIds: string[] = [];

      await db.runTransaction(async (tx) => {
        const providerRef = db.collection("users").doc(providerId);
        const dogRef = db.collection("dogs").doc(dogId);
        const ownerRef = db.collection("users").doc(ownerUid);
        const availRef = db.collection("availability").doc(providerId);

        const [providerSnap, dogSnap, ownerSnap, availSnap, ...holdSnaps] = await Promise.all([
          tx.get(providerRef),
          tx.get(dogRef),
          tx.get(ownerRef),
          tx.get(availRef),
          ...allHoldRefs.map((r) => tx.get(r)),
        ]);

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
        if (!dogSnap.exists) {
          const e = new Error("dog_not_found"); (e as any).code = "dog_not_found"; throw e;
        }
        const dogData = dogSnap.data()!;
        if (dogData.ownerId !== ownerUid) {
          const e = new Error("dog_not_found"); (e as any).code = "dog_not_found"; throw e;
        }
        if (!ownerSnap.exists) {
          const e = new Error("invalid_input"); (e as any).code = "invalid_input"; throw e;
        }
        const ownerData = ownerSnap.data()!;

        const availability: WeeklyAvailability = availSnap.exists
          ? (availSnap.data() as WeeklyAvailability)
          : { weekly: [], exceptions: [], minLeadMinutes: 120, maxHorizonDays: 60 };

        const holdsExistByOccurrence = aggregateHolds(slotsByOccurrence, holdSnaps);
        const analysis = analyzeOccurrences({
          occurrences,
          slotsByOccurrence,
          holdsExistByOccurrence,
          availability,
          durationMinutes,
          nowMs: Date.now(),
        });

        // Strict mode (skipUnavailable=false): abort on first non-available.
        if (!skipUnavailable) {
          const firstFail = analysis.find((a) => a.status !== "available");
          if (firstFail) {
            failedAtIndex = firstFail.index;
            const e = new Error(firstFail.status === "outside_windows" ? "slot_outside_availability"
              : firstFail.status === "too_far" ? "too_far_in_future"
              : firstFail.status === "too_close" ? "too_close_to_now"
              : firstFail.status === "taken" ? "slot_taken"
              : "slot_outside_availability");
            (e as any).code = e.message;
            throw e;
          }
        }

        const availableIndices = analysis
          .filter((a) => a.status === "available")
          .map((a) => a.index);
        returnedSkipped = analysis.filter((a) => a.status !== "available");

        if (availableIndices.length === 0) {
          // Nothing to create even with skip mode — surface a clean error
          const e = new Error("no_available_weeks"); (e as any).code = "no_available_weeks"; throw e;
        }

        // --- WRITES ---
        const priceEurInfo = priceEurInfoFor(providerData, service, durationMinutes);
        const now = admin.firestore.Timestamp.now();
        const createdSeriesBookingIds = availableIndices.map((i) => bookingIds[i]);

        // Series metadata doc — only references the bookings we actually create
        tx.set(seriesRef, {
          ownerId: ownerUid,
          providerId,
          dogId,
          service,
          durationMinutes,
          weeksCount,
          firstServiceAt: admin.firestore.Timestamp.fromDate(occurrences[availableIndices[0]]),
          lastServiceAt: admin.firestore.Timestamp.fromDate(
            occurrences[availableIndices[availableIndices.length - 1]],
          ),
          localHour: firstParts.hour,
          localMinute: firstParts.minute,
          weekdayIndex: firstParts.dayIndex,
          bookingIds: createdSeriesBookingIds,
          skippedIndices: returnedSkipped.map((s) => s.index),
          createdAt: now,
          cancelledAt: null,
          cancelledBy: null,
        });

        // Per-occurrence booking + holds + transition log — only for available indices
        let cursor = 0;
        for (let i = 0; i < occurrences.length; i++) {
          const slots = slotsByOccurrence[i];
          if (!availableIndices.includes(i)) {
            // Skip writes for this occurrence but still advance hold cursor
            cursor += slots.length;
            continue;
          }
          const at = occurrences[i];
          const serviceEndAt = new Date(at.getTime() + durationMinutes * 60 * 1000);
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
            serviceAt: admin.firestore.Timestamp.fromDate(at),
            serviceEndAt: admin.firestore.Timestamp.fromDate(serviceEndAt),
            durationMinutes,
            slotIds: slots,
            priceEurInfo,
            status: "confirmed",
            seriesId,
            // seriesIndex reflects the position within the *created* bookings,
            // so badges read "1 of 11" instead of "1 of 12 with gaps".
            seriesIndex: createdSeriesBookingIds.indexOf(bookingIds[i]) + 1,
            seriesTotal: createdSeriesBookingIds.length,
            ...(safeNotes ? { notes: safeNotes } : {}),
            createdAt: now,
            updatedAt: now,
          };
          tx.set(bookingRefs[i], bookingDoc);
          createdBookingIds.push(bookingIds[i]);

          for (let j = 0; j < slots.length; j++) {
            tx.set(allHoldRefs[cursor], {
              providerId,
              slotId: slots[j],
              bookingId: bookingIds[i],
              createdAt: now,
            });
            cursor++;
          }

          tx.set(db.collection("booking_transitions").doc(`${bookingIds[i]}_create`), {
            bookingId: bookingIds[i],
            transition: "create",
            appliedAt: now,
            appliedBy: ownerUid,
          });
        }
      });

      functions.logger.info("Recurring series created", {
        seriesId, weeksCount, ownerUid, providerId,
        created: createdBookingIds.length,
        skipped: returnedSkipped.length,
      });
      res.status(200).json({
        success: true,
        seriesId,
        bookingIds: createdBookingIds,
        skipped: returnedSkipped,
      });
    } catch (err: any) {
      const code = err?.code ?? "unknown";
      functions.logger.warn("createRecurringBookings rejected", { ownerUid, code, failedAtIndex });
      res.status(400).json({ error: code, failedAtIndex });
    }
  });

// ── cancelRecurringSeries ────────────────────────────────────────────────────
// Caller can be owner OR provider. Cancels all confirmed bookings in the
// series (or only those from `fromIndex` onwards). Idempotent per booking.

export const cancelRecurringSeries = functions
  .runWith({ memory: "512MB", timeoutSeconds: 60 })
  .https.onRequest(async (req, res) => {
    if (setupCors(req, res)) return;
    if (req.method !== "POST") {
      res.status(405).json({ error: "method_not_allowed" });
      return;
    }
    const caller = await verifyCallerToken(req, res);
    if (!caller) return;

    const { seriesId, fromIndex } = req.body ?? {};
    if (!seriesId || typeof seriesId !== "string") {
      res.status(400).json({ error: "invalid_input" });
      return;
    }

    try {
      const seriesRef = db.collection("recurring_series").doc(seriesId);
      const seriesSnap = await seriesRef.get();
      if (!seriesSnap.exists) {
        res.status(404).json({ error: "series_not_found" });
        return;
      }
      const series = seriesSnap.data()!;
      if (series.ownerId !== caller.uid && series.providerId !== caller.uid) {
        res.status(403).json({ error: "forbidden" });
        return;
      }

      const cancelledBy = series.ownerId === caller.uid ? "owner" : "provider";
      const allBookingIds: string[] = Array.isArray(series.bookingIds) ? series.bookingIds : [];
      const targetIds = typeof fromIndex === "number"
        ? allBookingIds.slice(fromIndex)
        : allBookingIds;

      let cancelled = 0;
      // Cancel each booking inside its own transaction. This keeps each cancel
      // atomic with its slot release while staying well under the 500-op cap.
      for (const bookingId of targetIds) {
        await db.runTransaction(async (tx) => {
          const bookingRef = db.collection("bookings").doc(bookingId);
          const transitionRef = db.collection("booking_transitions").doc(`${bookingId}_cancel`);
          const [bookingSnap, transitionSnap] = await Promise.all([
            tx.get(bookingRef),
            tx.get(transitionRef),
          ]);
          if (!bookingSnap.exists) return;
          if (transitionSnap.exists) return;
          const b = bookingSnap.data()!;
          if (b.status !== "confirmed") return;

          const now = admin.firestore.Timestamp.now();
          tx.update(bookingRef, {
            status: cancelledBy === "owner" ? "cancelled_by_owner" : "cancelled_by_provider",
            cancelledAt: now,
            cancelledBy,
            updatedAt: now,
          });
          // Release slot holds
          const slotIds: string[] = Array.isArray(b.slotIds) ? b.slotIds : [];
          for (const sid of slotIds) {
            tx.delete(db.collection("availability_holds").doc(`${b.providerId}_${sid}`));
          }
          tx.set(transitionRef, {
            bookingId,
            transition: "cancel",
            appliedAt: now,
            appliedBy: caller.uid,
          });
          cancelled++;
        });
      }

      // If the whole series was cancelled, mark the series doc.
      if (typeof fromIndex !== "number" || fromIndex === 0) {
        await seriesRef.update({
          cancelledAt: admin.firestore.Timestamp.now(),
          cancelledBy,
        });
      }

      res.status(200).json({ success: true, cancelled });
    } catch (err: any) {
      functions.logger.error("cancelRecurringSeries failed", { err: err?.message });
      res.status(500).json({ error: "cancel_failed" });
    }
  });
