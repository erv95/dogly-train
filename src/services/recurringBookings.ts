import { auth } from '../config/firebase';
import { BookingService } from '../types';

const CREATE_URL = 'https://us-central1-dogly-train.cloudfunctions.net/createRecurringBookings';
const CANCEL_URL = 'https://us-central1-dogly-train.cloudfunctions.net/cancelRecurringSeries';
const PREVIEW_URL = 'https://us-central1-dogly-train.cloudfunctions.net/previewRecurringSeries';

export interface CreateRecurringInput {
  providerId: string;
  dogId: string;
  service: BookingService;
  /** ISO UTC of the first occurrence. Subsequent ones derive from this. */
  firstSlotAt: string;
  durationMinutes: number;
  /** Number of weekly occurrences, between 2 and 12. */
  weeksCount: number;
  notes?: string;
  /** When true, skip occurrences that aren't available instead of aborting. */
  skipUnavailable?: boolean;
}

export type CreateRecurringError =
  | 'invalid_input'
  | 'provider_not_active'
  | 'dog_not_found'
  | 'slot_taken'
  | 'too_close_to_now'
  | 'too_far_in_future'
  | 'slot_outside_availability'
  | 'no_available_weeks'
  | 'rate_limited'
  | 'unknown';

export type OccurrenceStatus =
  | 'available'
  | 'taken'
  | 'outside_windows'
  | 'too_far'
  | 'too_close'
  | 'blocked';

export interface OccurrenceAnalysis {
  index: number;
  /** ISO UTC string. Render in client with Europe/Madrid. */
  serviceAt: string;
  status: OccurrenceStatus;
}

export interface PreviewResult {
  occurrences: OccurrenceAnalysis[];
  availableCount: number;
  unavailableCount: number;
}

export interface CreateRecurringResult {
  seriesId: string;
  bookingIds: string[];
  /** Occurrences that were skipped when skipUnavailable=true. */
  skipped: OccurrenceAnalysis[];
}

async function callWithToken(url: string, body: any) {
  const u = auth.currentUser;
  if (!u) throw new Error('unauthenticated');
  const idToken = await u.getIdToken();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = (data?.error as string) ?? 'unknown';
    const e = new Error(code) as any;
    e.failedAtIndex = data?.failedAtIndex ?? null;
    throw e;
  }
  return data;
}

export async function previewRecurringSeries(input: Omit<CreateRecurringInput, 'notes' | 'skipUnavailable'>): Promise<PreviewResult> {
  const data = await callWithToken(PREVIEW_URL, input);
  return {
    occurrences: data.occurrences ?? [],
    availableCount: data.availableCount ?? 0,
    unavailableCount: data.unavailableCount ?? 0,
  };
}

export async function createRecurringBookings(input: CreateRecurringInput): Promise<CreateRecurringResult> {
  const data = await callWithToken(CREATE_URL, input);
  return {
    seriesId: data.seriesId,
    bookingIds: data.bookingIds ?? [],
    skipped: data.skipped ?? [],
  };
}

export async function cancelRecurringSeries(seriesId: string, fromIndex?: number): Promise<{ cancelled: number }> {
  const body: any = { seriesId };
  if (typeof fromIndex === 'number') body.fromIndex = fromIndex;
  const data = await callWithToken(CANCEL_URL, body);
  return { cancelled: data.cancelled ?? 0 };
}
