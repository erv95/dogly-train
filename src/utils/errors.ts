import { Alert } from 'react-native';
import i18n from '../config/i18n';
import { CFError } from './cfClient';

/**
 * Maps Cloud Function `error` codes (and a handful of legacy
 * Error.message values from pre-Iter-2.1 services) to i18n keys.
 *
 * When a service throws an Error whose message is one of these keys,
 * `showErrorAlert` displays a tailored message instead of the generic
 * "Inténtalo de nuevo".
 *
 * Add new codes here as you add new server-side error returns. Keep keys in
 * lowercase snake_case, matching what the Cloud Function returns.
 */
const KNOWN_CODES: Record<string, string> = {
  // Auth / authz
  unauthenticated: 'errors.unauthenticated',
  forbidden: 'errors.forbidden',
  admin_only: 'errors.forbidden',

  // Rate limiting
  rate_limited: 'errors.rateLimited',
  too_many_requests: 'errors.rateLimited',

  // Validation
  invalid_input: 'errors.invalidInput',
  invalid_bookingId: 'errors.invalidInput',
  invalid_reason: 'errors.invalidInput',
  invalid_description: 'errors.invalidInput',
  invalid_amount: 'errors.invalidInput',
  invalid_token: 'errors.unauthenticated',

  // Booking flow
  slot_taken: 'errors.slotTaken',
  slot_outside_availability: 'errors.slotOutsideAvailability',
  too_close_to_now: 'errors.tooCloseToNow',
  too_far_in_future: 'errors.tooFarInFuture',
  provider_not_active: 'errors.providerNotActive',
  dog_not_found: 'errors.dogNotFound',
  booking_not_found: 'errors.bookingNotFound',
  no_available_weeks: 'errors.noAvailableWeeks',

  // Live session
  outside_window: 'errors.outsideWindow',
  session_not_found: 'errors.sessionNotFound',
  session_already_ended: 'errors.sessionAlreadyEnded',
  booking_not_active: 'errors.bookingNotActive',

  // Disputes
  dispute_not_found: 'errors.disputeNotFound',
  already_closed: 'errors.alreadyClosed',

  // Coins / payments
  insufficient_coins: 'errors.insufficientCoins',
  user_not_found: 'errors.userNotFound',
  would_go_negative: 'errors.wouldGoNegative',
  boost_failed: 'errors.boostFailed',
  network_error: 'errors.networkError',

  // Breed AI
  daily_limit_reached: 'errors.dailyLimitReached',
  image_too_large: 'errors.imageTooLarge',
  image_not_found: 'errors.imageNotFound',
  ai_error: 'errors.aiError',
  ai_parse_error: 'errors.aiError',

  // Premium / referrals
  already_premium: 'errors.alreadyPremium',
};

/** Look up the i18n key for an error code, falling back when unknown. */
function keyForCode(code: string, fallback: string): string {
  return KNOWN_CODES[code] ?? fallback;
}

/**
 * Centralised error alert. Surfaces a tailored localised message when the
 * error carries a known code; otherwise falls back to `fallbackKey`.
 *
 * Accepts:
 *  - `CFError` from `callCF` → uses `.code`.
 *  - Legacy `Error` whose `.message` is a known code (kept for services that
 *    still re-throw `new Error(code)` for backwards compat).
 *  - Anything else → fallbackKey.
 *
 * @example
 *   try { await openDispute(...) }
 *   catch (err) { showErrorAlert(err); }
 */
export function showErrorAlert(
  err: unknown,
  fallbackKey: string = 'errors.generic',
): void {
  const t = i18n.t.bind(i18n);
  let key = fallbackKey;

  if (err instanceof CFError) {
    key = keyForCode(err.code, fallbackKey);
  } else if (err instanceof Error && typeof err.message === 'string') {
    key = keyForCode(err.message, fallbackKey);
  }

  Alert.alert(t('common.error'), t(key));
}

/** Same as `showErrorAlert` but returns the resolved message string instead
 *  of firing the Alert. Useful when the UI wants to embed the message
 *  inline (e.g. under a form field). */
export function errorMessage(
  err: unknown,
  fallbackKey: string = 'errors.generic',
): string {
  const t = i18n.t.bind(i18n);
  let key = fallbackKey;
  if (err instanceof CFError) {
    key = keyForCode(err.code, fallbackKey);
  } else if (err instanceof Error && typeof err.message === 'string') {
    key = keyForCode(err.message, fallbackKey);
  }
  return t(key);
}
