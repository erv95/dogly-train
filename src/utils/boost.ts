/**
 * Shared boost-status helpers. Pulled out of 4 near-identical copies in
 * (trainer)/(caretaker) dashboard + coins screens — single source of truth
 * so the time-remaining math doesn't drift between roles.
 */

/** A Firestore Timestamp or anything that can be coerced into a Date. */
type BoostStamp = { toDate: () => Date } | Date | string | number | null | undefined;

export interface BoostTimeRemaining {
  hours: number;
  minutes: number;
}

/**
 * Returns hours+minutes remaining until `boostedUntil` elapses, or null when
 * the boost has expired (or was never set).
 */
export function getBoostTimeRemaining(boostedUntil: BoostStamp): BoostTimeRemaining | null {
  if (!boostedUntil) return null;
  const end = typeof boostedUntil === 'object' && 'toDate' in boostedUntil
    ? boostedUntil.toDate()
    : new Date(boostedUntil as any);
  const diff = end.getTime() - Date.now();
  if (diff <= 0) return null;
  return {
    hours: Math.floor(diff / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
  };
}

/** Convenience: just whether the boost is currently active. */
export function isBoostActive(boostedUntil: BoostStamp): boolean {
  return getBoostTimeRemaining(boostedUntil) !== null;
}
