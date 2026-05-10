import { ref, uploadBytes } from 'firebase/storage';
import { auth, storage } from '../config/firebase';
import { BreedIdentifyResponse } from '../types';

const FUNCTION_URL = 'https://us-central1-dogly-train.cloudfunctions.net/identifyBreed';

/** How many coins each call costs (kept in sync with the Cloud Function constant). */
export const BREED_AI_COIN_COST = 10;

/** Daily limit per user (kept in sync with the server). */
export const BREED_AI_DAILY_LIMIT = 5;

export type BreedAiError =
  | 'unauthenticated'
  | 'user_not_found'
  | 'insufficient_coins'
  | 'daily_limit_reached'
  | 'image_too_large'
  | 'image_not_found'
  | 'ai_error'
  | 'ai_parse_error'
  | 'unknown';

/** Upload a local image (file:// uri) to Storage under the user's breed_uploads
 *  folder. Returns the storagePath the Cloud Function will pull from. */
export async function uploadBreedPhoto(uri: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('unauthenticated');
  const ts = Date.now();
  const storagePath = `breed_uploads/${user.uid}/${ts}.jpg`;
  const storageRef = ref(storage, storagePath);
  const response = await fetch(uri);
  const blob = await response.blob();
  await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
  return storagePath;
}

/** Calls the Cloud Function. Returns the parsed result, or throws a
 *  `BreedAiError`-shaped Error.message for the screen to render properly.
 *  `language` is the i18n code (es/en/fr/pt/de) — passed to the AI so it
 *  responds in the user's language. */
export async function identifyBreed(
  storagePath: string,
  dogId?: string,
  language?: string,
): Promise<BreedIdentifyResponse> {
  const user = auth.currentUser;
  if (!user) throw new Error('unauthenticated');
  const idToken = await user.getIdToken();

  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ storagePath, dogId, language }),
  });

  if (!res.ok) {
    let code: BreedAiError = 'unknown';
    try {
      const data = await res.json();
      if (typeof data?.error === 'string') code = data.error as BreedAiError;
    } catch { /* swallow */ }
    throw new Error(code);
  }

  return (await res.json()) as BreedIdentifyResponse;
}
