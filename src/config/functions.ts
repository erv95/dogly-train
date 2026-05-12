/**
 * Single source of truth for the Cloud Functions base URL.
 *
 * Production functions live in `us-central1` (deployment region — separate
 * from the Firestore/Storage EU region migrated in Iter 1.0). If we ever
 * migrate the functions themselves to a different region or deploy under
 * a different project, change this constant ONCE and every service updates.
 *
 * For local development against the Firebase Emulator Suite, set
 * `EXPO_PUBLIC_FUNCTIONS_BASE=http://localhost:5001/dogly-train/us-central1`
 * in `.env` or `app.config.ts` extra fields.
 */
export const FUNCTIONS_BASE =
  process.env.EXPO_PUBLIC_FUNCTIONS_BASE ??
  'https://us-central1-dogly-train.cloudfunctions.net';

/** Build the full URL for a deployed Cloud Function by name. */
export const cfUrl = (name: string): string => `${FUNCTIONS_BASE}/${name}`;
