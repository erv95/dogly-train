import { callCF, CFError } from '../utils/cfClient';
import { BookingService } from '../types';

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

/** Wrap callCF to preserve the legacy `error.message`-based interface used
 *  by the recurring-bookings UI. Also surfaces `failedAtIndex` (which week
 *  triggered the slot_taken) as an Error field. */
async function callRecurring<T>(name: string, body: unknown): Promise<T> {
  try {
    return await callCF<T>(name, body);
  } catch (err) {
    if (err instanceof CFError) {
      const e = new Error(err.code) as any;
      if (err.raw) {
        try {
          const data = JSON.parse(err.raw);
          if (typeof data?.failedAtIndex === 'number') e.failedAtIndex = data.failedAtIndex;
        } catch { /* not JSON */ }
      }
      throw e;
    }
    throw err;
  }
}

export async function previewRecurringSeries(input: Omit<CreateRecurringInput, 'notes' | 'skipUnavailable'>): Promise<PreviewResult> {
  const data = await callRecurring<any>('previewRecurringSeries', input);
  return {
    occurrences: data.occurrences ?? [],
    availableCount: data.availableCount ?? 0,
    unavailableCount: data.unavailableCount ?? 0,
  };
}

export async function createRecurringBookings(input: CreateRecurringInput): Promise<CreateRecurringResult> {
  const data = await callRecurring<any>('createRecurringBookings', input);
  return {
    seriesId: data.seriesId,
    bookingIds: data.bookingIds ?? [],
    skipped: data.skipped ?? [],
  };
}

export async function cancelRecurringSeries(seriesId: string, fromIndex?: number): Promise<{ cancelled: number }> {
  const body: Record<string, unknown> = { seriesId };
  if (typeof fromIndex === 'number') body.fromIndex = fromIndex;
  const data = await callRecurring<any>('cancelRecurringSeries', body);
  return { cancelled: data.cancelled ?? 0 };
}
