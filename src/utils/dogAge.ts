import type { TFunction } from 'i18next';
import type { Dog } from '../types';

/**
 * Helpers that interpret a dog's age. Prefers the precise `birthdate` field
 * (added in Iter 8.0) when present, falls back to the legacy `age` integer
 * (in whole years) so dogs created before the field existed keep rendering
 * correctly.
 *
 * Use these everywhere the UI shows / decides based on age — never read
 * `dog.age` directly anymore.
 */

type DogAgeInputs = Pick<Dog, 'birthdate' | 'age'>;

/** Months between today and the dog's birthdate. Falls back to `age * 12`
 *  when `birthdate` is missing. Always returns a non-negative integer. */
export function getAgeMonths(dog: DogAgeInputs): number {
  if (dog.birthdate) {
    const birth = new Date(dog.birthdate);
    if (!Number.isNaN(birth.getTime())) {
      const now = new Date();
      const years = now.getFullYear() - birth.getFullYear();
      const months = now.getMonth() - birth.getMonth();
      // Subtract a month if the day-of-month hasn't reached the birthday
      // yet (e.g. today=8 Jan, birth=15 Dec → 0 months, not 1).
      const dayAdjust = now.getDate() < birth.getDate() ? -1 : 0;
      return Math.max(0, years * 12 + months + dayAdjust);
    }
  }
  return Math.max(0, Math.floor((dog.age ?? 0) * 12));
}

/** True if the dog is under 12 months old. Drives the "puppy mode" copy
 *  and tutorial steps. */
export function isPuppy(dog: DogAgeInputs): boolean {
  return getAgeMonths(dog) < 12;
}

/** Short human-readable age string: "8 meses" / "2 años". Picks singular vs
 *  plural in code instead of relying on i18next pluralisation suffixes — the
 *  project runs with `compatibilityJSON: 'v3'`, which is incompatible with
 *  the v4 `_one`/`_other` keys we'd otherwise want, and v3's own
 *  `_plural` syntax doesn't cover all locales cleanly. Keeping 4 explicit
 *  keys is verbose but works everywhere. */
export function formatAgeShort(dog: DogAgeInputs, t: TFunction): string {
  const months = getAgeMonths(dog);
  if (months < 12) {
    return months === 1
      ? t('puppy.monthSingular', { count: 1 })
      : t('puppy.monthsPlural', { count: months });
  }
  const years = Math.floor(months / 12);
  return years === 1
    ? t('puppy.yearSingular', { count: 1 })
    : t('puppy.yearsPlural', { count: years });
}
