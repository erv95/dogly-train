// ── Booking system constants ─────────────────────────────────────────────────
// All shared between client and the slot-math helpers in availability.ts.
// The Cloud Function defines its OWN copies (functions/src/bookings.ts) to
// avoid a server→client TypeScript import; keep these in sync if you change
// any of them.

/** All slot times are computed in this IANA timezone. The app is locked to
 *  Spain in v1 — no per-provider timezone override. */
export const BOOKING_TIMEZONE = 'Europe/Madrid';

/** Slot grid in minutes. A 60-minute booking takes 2 contiguous slots. */
export const SLOT_MINUTES = 30;

/** Default minimum lead time before a slot starts. Provider can override per-account. */
export const DEFAULT_MIN_LEAD_MINUTES = 120;

/** Default max booking horizon in days. */
export const DEFAULT_MAX_HORIZON_DAYS = 60;

/** Allowed booking durations exposed in the picker. */
export const BOOKING_DURATION_OPTIONS = [30, 60, 90, 120] as const;

/** Owner notes max length (also enforced server-side). */
export const BOOKING_NOTES_MAX = 280;
