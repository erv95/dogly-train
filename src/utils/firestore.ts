/**
 * Firestore helpers — small adapters that smooth over the Timestamp /
 * Date / serialized boundary so we stop sprinkling `(x as any).toDate?.()`
 * across the app.
 */

/**
 * Coerce a Firestore Timestamp (or a date-string / number / native Date)
 * into a JS Date. Returns null when the input is null/undefined or can't
 * be parsed. Safe to call on values that may or may not have been
 * serialized to JSON (e.g. through a Cloud Function response).
 */
export function tsToDate(value: unknown): Date | null {
  if (value == null) return null;
  // Firestore Timestamp has a .toDate() method.
  if (typeof value === 'object' && 'toDate' in (value as object)
      && typeof (value as { toDate: unknown }).toDate === 'function') {
    try {
      const d = (value as { toDate: () => Date }).toDate();
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  // Serialized form from a CF: { _seconds, _nanoseconds } or { seconds, nanoseconds }
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    const seconds = (typeof v._seconds === 'number' ? v._seconds
      : typeof v.seconds === 'number' ? v.seconds : null);
    if (seconds != null) {
      const nanos = (typeof v._nanoseconds === 'number' ? v._nanoseconds
        : typeof v.nanoseconds === 'number' ? v.nanoseconds : 0);
      return new Date(seconds * 1000 + Math.floor(nanos / 1_000_000));
    }
  }
  return null;
}

/** Convenience: same as `tsToDate(x)?.getTime() ?? 0` for sort comparators. */
export function tsToMillis(value: unknown): number {
  return tsToDate(value)?.getTime() ?? 0;
}
