/**
 * Shared date-input helpers for DD/MM/YYYY masked text fields and ISO
 * conversion. Originally duplicated in [app/(auth)/complete-profile.tsx](
 * app/(auth)/complete-profile.tsx) (user DOB) and [app/(shared)/dog-form.tsx](
 * app/(shared)/dog-form.tsx) (dog birthdate). The puppy-parent pivot is
 * about to introduce a 3rd consumer (parent-type screen) — extracting now
 * eliminates the duplication before it tripled.
 *
 * All functions are pure and locale-agnostic — they only work on the
 * digit/slash format used by our forms. Date parsing happens elsewhere
 * (via `new Date(iso)`); these are string transforms only.
 */

/** Mask raw keystrokes into the DD/MM/YYYY shape — strip non-digits, cap at
 *  8 digits, insert slashes at positions 2 and 4. */
export function formatDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Convert a complete DD/MM/YYYY display string to ISO `YYYY-MM-DD`.
 *  Returns empty string for partial input so callers can guard cheaply. */
export function ddmmyyyyToISO(display: string): string {
  const parts = display.split('/');
  if (parts.length !== 3 || parts[2].length !== 4) return '';
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

/** Convert ISO `YYYY-MM-DD` back to DD/MM/YYYY display. Returns empty when
 *  the input is null/undefined or malformed. Used when pre-filling forms
 *  with stored values. */
export function isoToDDMMYYYY(iso: string | null | undefined): string {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return '';
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}
