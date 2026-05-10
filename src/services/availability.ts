import {
  doc,
  getDoc,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  WeeklyAvailability,
  WeeklyAvailabilityDay,
  AvailabilityException,
} from '../types';
import {
  BOOKING_TIMEZONE,
  SLOT_MINUTES,
  DEFAULT_MIN_LEAD_MINUTES,
  DEFAULT_MAX_HORIZON_DAYS,
} from '../config/booking';

const COLLECTION = 'availability';

// ── Pure helpers ─────────────────────────────────────────────────────────────

/** Local-Madrid date parts of a UTC instant, computed via Intl. DST-safe. */
export function madridParts(d: Date): {
  year: number; month: number; day: number;
  hour: number; minute: number;
  /** ISO weekday Monday=1..Sunday=7 → returned as 0..6 (0=Mon). */
  dayIndex: number;
  /** 'YYYY-MM-DD' in Madrid. */
  isoDate: string;
} {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: BOOKING_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    weekday: 'short',
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const year = parseInt(get('year'), 10);
  const month = parseInt(get('month'), 10);
  const day = parseInt(get('day'), 10);
  const hour = parseInt(get('hour'), 10);
  const minute = parseInt(get('minute'), 10);
  const wk = get('weekday'); // 'Mon' | 'Tue' | …
  const map: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const dayIndex = map[wk] ?? 0;
  const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { year, month, day, hour, minute, dayIndex, isoDate };
}

/** Slot id used for race-safe locking. Identical for any client/server. */
export function slotIdAt(utcMillis: number): string {
  return String(Math.floor(utcMillis / (SLOT_MINUTES * 60 * 1000)));
}

/** Returns the array of slot ids covering [startUtc, startUtc + minutes). */
export function slotIdsForRange(startUtcMillis: number, minutes: number): string[] {
  const count = Math.ceil(minutes / SLOT_MINUTES);
  const start = Math.floor(startUtcMillis / (SLOT_MINUTES * 60 * 1000));
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(String(start + i));
  return out;
}

/** Empty 7-day weekly skeleton (Mon..Sun, no windows). */
export function emptyWeeklySkeleton(): WeeklyAvailabilityDay[] {
  return Array.from({ length: 7 }, (_, i) => ({ dayIndex: i, windows: [] }));
}

export function defaultWeeklyAvailability(providerId: string): WeeklyAvailability {
  return {
    providerId,
    weekly: emptyWeeklySkeleton(),
    exceptions: [],
    minLeadMinutes: DEFAULT_MIN_LEAD_MINUTES,
    maxHorizonDays: DEFAULT_MAX_HORIZON_DAYS,
    updatedAt: Timestamp.now(),
  };
}

/** Returns the windows applicable to a given Madrid date, considering
 *  exceptions overrides. */
export function windowsForDate(
  availability: WeeklyAvailability,
  isoDate: string,
  dayIndex: number,
): { startMin: number; endMin: number }[] {
  const exception = availability.exceptions.find((e) => e.date === isoDate);
  if (exception) {
    if (exception.blocked) return [];
    return exception.windows ?? [];
  }
  return availability.weekly[dayIndex]?.windows ?? [];
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

/** TTL cache for `getAvailability` — provider's schedule rarely changes; the
 *  owner's calendar would otherwise read this once per render. */
const cache = new Map<string, { value: WeeklyAvailability; until: number }>();
const CACHE_TTL_MS = 60_000;

export async function getAvailability(providerId: string): Promise<WeeklyAvailability | null> {
  const cached = cache.get(providerId);
  if (cached && cached.until > Date.now()) return cached.value;

  const snap = await getDoc(doc(db, COLLECTION, providerId));
  if (!snap.exists()) return null;
  const value = snap.data() as WeeklyAvailability;
  cache.set(providerId, { value, until: Date.now() + CACHE_TTL_MS });
  return value;
}

/** Provider-side: replace the entire weekly schedule. Bumps the in-memory cache. */
export async function setWeeklyAvailability(
  providerId: string,
  weekly: WeeklyAvailabilityDay[],
  options?: { minLeadMinutes?: number; maxHorizonDays?: number },
): Promise<void> {
  if (weekly.length !== 7) throw new Error('Weekly schedule must have 7 entries');
  const existing = await getAvailability(providerId);
  const data: WeeklyAvailability = {
    providerId,
    weekly,
    exceptions: existing?.exceptions ?? [],
    minLeadMinutes: options?.minLeadMinutes ?? existing?.minLeadMinutes ?? DEFAULT_MIN_LEAD_MINUTES,
    maxHorizonDays: options?.maxHorizonDays ?? existing?.maxHorizonDays ?? DEFAULT_MAX_HORIZON_DAYS,
    updatedAt: Timestamp.now(),
  };
  await setDoc(doc(db, COLLECTION, providerId), data);
  cache.delete(providerId);
}

/** Add or replace a date-specific exception. Replaces by `date`. */
export async function upsertException(
  providerId: string,
  exception: AvailabilityException,
): Promise<void> {
  const existing = (await getAvailability(providerId)) ?? defaultWeeklyAvailability(providerId);
  const filtered = existing.exceptions.filter((e) => e.date !== exception.date);
  const data: WeeklyAvailability = {
    ...existing,
    exceptions: [...filtered, exception].sort((a, b) => a.date.localeCompare(b.date)),
    updatedAt: Timestamp.now(),
  };
  await setDoc(doc(db, COLLECTION, providerId), data);
  cache.delete(providerId);
}

export async function removeException(
  providerId: string,
  date: string,
): Promise<void> {
  const existing = await getAvailability(providerId);
  if (!existing) return;
  const data: WeeklyAvailability = {
    ...existing,
    exceptions: existing.exceptions.filter((e) => e.date !== date),
    updatedAt: Timestamp.now(),
  };
  await setDoc(doc(db, COLLECTION, providerId), data);
  cache.delete(providerId);
}

/** Force-clear the cache (used e.g. after the editor saves to refresh
 *  immediately on the next read). */
export function invalidateAvailabilityCache(providerId?: string): void {
  if (providerId) cache.delete(providerId);
  else cache.clear();
}
