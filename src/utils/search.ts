/**
 * Normalize a string for case- and accent-insensitive search.
 *
 *   "José"   → "jose"
 *   "MÜLLER" → "muller"
 *   "  Anna" → "anna"
 *
 * Used to populate `displayNameLower` on user docs and to normalize the
 * incoming search query before hitting Firestore. Both sides go through
 * the same function so the comparison is symmetric.
 */
export function normalizeForSearch(input: string): string {
  return input
    .normalize('NFD')
    // Strip combining diacritical marks (U+0300 – U+036F)
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}
