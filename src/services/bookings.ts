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
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as ImageManipulator from 'expo-image-manipulator';
import { auth, db, storage } from '../config/firebase';
import { cfUrl } from '../config/functions';
import { callCF, CFError } from '../utils/cfClient';
import {
  Booking,
  BookingService,
  BookingStatus,
} from '../types';

const COLLECTION = 'bookings';

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

/** Create a new booking via the Cloud Function. Throws an Error whose
 *  `message` is one of `CreateBookingError` so the UI can localise it.
 *
 *  Special case: on `too_close_to_now` / `too_far_in_future` the server
 *  includes `minLeadMinutes` / `maxHorizonDays` so the UI can say e.g.
 *  "minimum 30 min ahead". We surface those as Error fields. */
export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
  try {
    return await callCF<CreateBookingResult>('createBooking', input);
  } catch (err) {
    if (err instanceof CFError) {
      // Translate the typed CFError into the legacy Error-with-message shape
      // expected by the UI (consumers switch on `error.message`).
      const known: CreateBookingError[] = [
        'invalid_input', 'rate_limited', 'provider_not_active',
        'dog_not_found', 'slot_taken', 'slot_outside_availability',
        'too_close_to_now', 'too_far_in_future', 'unauthenticated',
      ];
      const code: CreateBookingError =
        known.includes(err.code as CreateBookingError)
          ? (err.code as CreateBookingError)
          : 'unknown';
      const e = new Error(code) as any;
      // Parse server hints if present (raw is the unparsed body string).
      if (err.raw) {
        try {
          const data = JSON.parse(err.raw);
          if (typeof data?.minLeadMinutes === 'number') e.minLeadMinutes = data.minLeadMinutes;
          if (typeof data?.maxHorizonDays === 'number') e.maxHorizonDays = data.maxHorizonDays;
        } catch { /* raw wasn't JSON, ignore */ }
      }
      throw e;
    }
    throw err;
  }
}

export async function cancelBooking(bookingId: string): Promise<void> {
  await callCF('cancelBooking', { bookingId });
}

/** Mark a confirmed booking as completed. Requires `completionPhotoURL`
 *  (https URL of a photo proof) — server rejects calls without it. The UI
 *  should either reuse the latest live-session photo or capture a new one
 *  before calling this. */
export async function markBookingCompleted(bookingId: string, completionPhotoURL: string): Promise<void> {
  await callCF('markBookingCompleted', { bookingId, completionPhotoURL });
}

/** Compress a photo URI to ~1024px and upload to Storage at
 *  `booking_completion_photos/{bookingId}/photo.jpg`. Returns the download URL. */
export async function uploadCompletionPhoto(bookingId: string, sourceUri: string): Promise<string> {
  // Compress to keep storage costs low — 1024px is plenty for proof-of-service
  const compressed = await ImageManipulator.manipulateAsync(
    sourceUri,
    [{ resize: { width: 1024 } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
  );
  const path = `booking_completion_photos/${bookingId}/photo.jpg`;
  const response = await fetch(compressed.uri);
  const blob = await response.blob();
  await uploadBytes(ref(storage, path), blob, { contentType: 'image/jpeg' });
  return await getDownloadURL(ref(storage, path));
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
  try {
    const data = await callCF<{ slotIds?: string[] }>(
      'getProviderOccupiedSlots',
      { providerId, fromUtcMillis, toUtcMillis },
    );
    return Array.isArray(data?.slotIds) ? data.slotIds : [];
  } catch {
    // Best-effort: a server hiccup here just means the UI shows no
    // occupied-slot strikethroughs. Don't surface as an error.
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
