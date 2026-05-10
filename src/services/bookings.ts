import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import {
  Booking,
  BookingService,
  BookingStatus,
} from '../types';

const COLLECTION = 'bookings';
const FUNCTION_URL = 'https://us-central1-dogly-train.cloudfunctions.net/createBooking';
const FUNCTION_URL_CANCEL = 'https://us-central1-dogly-train.cloudfunctions.net/cancelBooking';
const FUNCTION_URL_COMPLETE = 'https://us-central1-dogly-train.cloudfunctions.net/markBookingCompleted';
const FUNCTION_URL_OCCUPIED = 'https://us-central1-dogly-train.cloudfunctions.net/getProviderOccupiedSlots';

export type CreateBookingError =
  | 'unauthenticated'
  | 'invalid_input'
  | 'rate_limited'
  | 'provider_not_active'
  | 'dog_not_found'
  | 'slot_taken'
  | 'slot_outside_availability'
  | 'too_close_to_now'
  | 'too_far_in_future'
  | 'unknown';

export interface CreateBookingInput {
  providerId: string;
  dogId: string;
  service: BookingService;
  /** UTC ISO string. */
  serviceAt: string;
  durationMinutes: number;
  notes?: string;
}

export interface CreateBookingResult {
  success: true;
  bookingId: string;
}

/** Create a new booking via the Cloud Function. Throws Error whose message is
 *  one of `CreateBookingError` for the UI to localise. */
export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
  const user = auth.currentUser;
  if (!user) throw new Error('unauthenticated');
  const idToken = await user.getIdToken();

  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    let code: CreateBookingError = 'unknown';
    let raw: string | null = null;
    let minLeadMinutes: number | undefined;
    let maxHorizonDays: number | undefined;
    try {
      raw = await res.text();
      const data = JSON.parse(raw);
      if (typeof data?.error === 'string') {
        const known: CreateBookingError[] = [
          'invalid_input', 'rate_limited', 'provider_not_active',
          'dog_not_found', 'slot_taken', 'slot_outside_availability',
          'too_close_to_now', 'too_far_in_future',
        ];
        if (known.includes(data.error as CreateBookingError)) {
          code = data.error as CreateBookingError;
        }
      }
      if (typeof data?.minLeadMinutes === 'number') minLeadMinutes = data.minLeadMinutes;
      if (typeof data?.maxHorizonDays === 'number') maxHorizonDays = data.maxHorizonDays;
    } catch { /* response wasn't JSON — keep `unknown` */ }
    console.warn('createBooking failed', { status: res.status, code, body: raw?.slice(0, 300) });
    const e = new Error(code) as any;
    if (minLeadMinutes != null) e.minLeadMinutes = minLeadMinutes;
    if (maxHorizonDays != null) e.maxHorizonDays = maxHorizonDays;
    throw e;
  }

  return (await res.json()) as CreateBookingResult;
}

async function callBookingFunction(url: string, bookingId: string, label: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('unauthenticated');
  const idToken = await user.getIdToken();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ bookingId }),
  });
  if (!res.ok) {
    let code = 'unknown';
    let raw: string | null = null;
    try {
      raw = await res.text();
      const d = JSON.parse(raw);
      if (typeof d?.error === 'string') code = d.error;
    } catch { /* response wasn't JSON (e.g. 404 HTML) */ }
    console.warn(`${label} failed`, { status: res.status, code, body: raw?.slice(0, 300) });
    throw new Error(code);
  }
}

export async function cancelBooking(bookingId: string): Promise<void> {
  await callBookingFunction(FUNCTION_URL_CANCEL, bookingId, 'cancelBooking');
}

export async function markBookingCompleted(bookingId: string): Promise<void> {
  await callBookingFunction(FUNCTION_URL_COMPLETE, bookingId, 'markBookingCompleted');
}

// ── Read-side helpers ────────────────────────────────────────────────────────

export async function getBooking(bookingId: string): Promise<Booking | null> {
  const snap = await getDoc(doc(db, COLLECTION, bookingId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Booking, 'id'>) };
}

export type BookingRoleView = 'owner' | 'provider';

export interface ListBookingsOptions {
  /** Filter by status. Pass undefined for all. */
  status?: BookingStatus;
  /** Cursor for pagination. */
  cursor?: QueryDocumentSnapshot<DocumentData> | null;
  /** Page size. Defaults to 20. */
  pageSize?: number;
  /** Sort direction by serviceAt. Use `asc` for upcoming (closest in future
   *  first), `desc` for past/cancelled (most recent first). Default `desc`. */
  order?: 'asc' | 'desc';
}

/** List the current user's bookings, ordered by serviceAt. The role decides
 *  which side of the booking to filter (`ownerId` vs `providerId`). */
export async function listMyBookings(
  role: BookingRoleView,
  userId: string,
  options: ListBookingsOptions = {},
): Promise<{ items: Booking[]; nextCursor: QueryDocumentSnapshot<DocumentData> | null }> {
  const pageSize = options.pageSize ?? 20;
  const order = options.order ?? 'desc';
  const fieldName = role === 'owner' ? 'ownerId' : 'providerId';

  const runQuery = async (dir: 'asc' | 'desc') => {
    const constraints: QueryConstraint[] = [where(fieldName, '==', userId)];
    if (options.status) constraints.push(where('status', '==', options.status));
    constraints.push(orderBy('serviceAt', dir));
    if (options.cursor) constraints.push(startAfter(options.cursor));
    constraints.push(limit(pageSize));
    return getDocs(query(collection(db, COLLECTION), ...constraints));
  };

  let snap;
  let reversedFromFallback = false;
  try {
    snap = await runQuery(order);
  } catch (err: any) {
    // Firestore returns 'failed-precondition' both when the index is missing
    // and when it's still building. Fall back to the opposite direction (whose
    // index existed first) and reverse client-side so the user sees data.
    const msg = String(err?.message ?? '');
    if (err?.code === 'failed-precondition' || msg.includes('requires an index')) {
      console.warn('listMyBookings index not ready, falling back to reverse order', { order });
      snap = await runQuery(order === 'asc' ? 'desc' : 'asc');
      reversedFromFallback = true;
    } else {
      throw err;
    }
  }

  let items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Booking, 'id'>) }));
  if (reversedFromFallback) items = items.reverse();
  return {
    items,
    nextCursor: snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1] : null,
  };
}

/** Existing bookings of a provider that overlap a given UTC date range — used
 *  by the slot picker to grey out occupied slots. Capped to 100 per call. */
export async function listProviderBookingsInRange(
  providerId: string,
  fromUtcMillis: number,
  toUtcMillis: number,
): Promise<Booking[]> {
  const fromTs = new Date(fromUtcMillis);
  const toTs = new Date(toUtcMillis);
  const q = query(
    collection(db, COLLECTION),
    where('providerId', '==', providerId),
    where('serviceAt', '>=', fromTs),
    where('serviceAt', '<', toTs),
    orderBy('serviceAt', 'asc'),
    limit(100),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Booking, 'id'>) }))
    // Filter out cancelled — their slots are already released
    .filter((b) => b.status === 'confirmed' || b.status === 'completed');
}

/** Server-side lookup of slot IDs occupied by a provider in the given UTC
 *  range. Goes through a Cloud Function with admin SDK so it works for any
 *  authenticated user (Firestore rules block direct queries on bookings
 *  belonging to others). Returns an empty array on failure. */
export async function getProviderOccupiedSlots(
  providerId: string,
  fromUtcMillis: number,
  toUtcMillis: number,
): Promise<string[]> {
  const user = auth.currentUser;
  if (!user) return [];
  try {
    const idToken = await user.getIdToken();
    const res = await fetch(FUNCTION_URL_OCCUPIED, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ providerId, fromUtcMillis, toUtcMillis }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.slotIds) ? data.slotIds : [];
  } catch {
    return [];
  }
}

// ── Provider stats ──────────────────────────────────────────────────────────

export interface ProviderBookingStats {
  /** Bookings completed in the current calendar month (Madrid). */
  completedThisMonth: number;
  /** Confirmed bookings whose serviceAt is in the future. */
  upcoming: number;
  /** Per-month completed counts for the last `monthsBack` months (oldest first). */
  monthlyCompleted: Array<{ year: number; month: number; count: number; label: string }>;
}

const MONTH_LABEL_KEYS = [
  'common.month.jan', 'common.month.feb', 'common.month.mar', 'common.month.apr',
  'common.month.may', 'common.month.jun', 'common.month.jul', 'common.month.aug',
  'common.month.sep', 'common.month.oct', 'common.month.nov', 'common.month.dec',
];

/** Aggregate booking stats for a provider over the last `monthsBack` months.
 *  Two queries: completed bookings in window + upcoming confirmed. */
export async function getProviderBookingStats(
  providerId: string,
  translate: (key: string) => string,
  monthsBack: number = 6,
): Promise<ProviderBookingStats> {
  const now = new Date();
  // Start of "monthsBack months ago" anchored to Europe/Madrid is approximated
  // here by JS local time — for stats this is good enough. Counters are computed
  // in Madrid via the same heuristic.
  const windowStart = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);

  // Both queries use orderBy DESC so they hit the existing
  // `providerId + status + serviceAt DESC` composite index (no extra index needed).
  const completedQ = query(
    collection(db, COLLECTION),
    where('providerId', '==', providerId),
    where('status', '==', 'completed'),
    where('serviceAt', '>=', windowStart),
    orderBy('serviceAt', 'desc'),
    limit(500),
  );

  const upcomingQ = query(
    collection(db, COLLECTION),
    where('providerId', '==', providerId),
    where('status', '==', 'confirmed'),
    where('serviceAt', '>=', new Date()),
    orderBy('serviceAt', 'desc'),
    limit(500),
  );

  const [completedSnap, upcomingSnap] = await Promise.all([
    getDocs(completedQ),
    getDocs(upcomingQ),
  ]);

  // Build monthly buckets
  const buckets: Record<string, number> = {};
  const monthlyCompleted: ProviderBookingStats['monthlyCompleted'] = [];
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1 - i), 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    buckets[key] = 0;
    monthlyCompleted.push({
      year: d.getFullYear(),
      month: d.getMonth(),
      count: 0,
      label: translate(MONTH_LABEL_KEYS[d.getMonth()]),
    });
  }

  let completedThisMonth = 0;
  const currentMonthKey = `${now.getFullYear()}-${now.getMonth()}`;
  for (const docSnap of completedSnap.docs) {
    const b = docSnap.data() as Booking;
    const at = b.serviceAt.toDate();
    const key = `${at.getFullYear()}-${at.getMonth()}`;
    if (buckets[key] !== undefined) buckets[key]++;
    if (key === currentMonthKey) completedThisMonth++;
  }
  for (const item of monthlyCompleted) {
    item.count = buckets[`${item.year}-${item.month}`] ?? 0;
  }

  return {
    completedThisMonth,
    upcoming: upcomingSnap.size,
    monthlyCompleted,
  };
}
