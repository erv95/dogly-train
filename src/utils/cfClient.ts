import { auth } from '../config/firebase';
import { cfUrl } from '../config/functions';

/**
 * Strongly-typed Cloud Function error. Carries the server's `error` code so
 * UI layers can map it to a localised message via `showErrorAlert` (Iter 2.3)
 * without falling back to generic "Something went wrong".
 *
 * Conventional `code` values returned by our functions (`functions/src/*.ts`):
 *   - `unauthenticated`    — no token / invalid token
 *   - `forbidden`          — token OK but caller lacks permission
 *   - `rate_limited`       — hit the per-user throttle (HTTP 429)
 *   - `invalid_input`      — malformed body
 *   - `slot_taken`         — booking race lost
 *   - `booking_not_found`  — referenced doc gone
 *   - `provider_not_active`
 *   - `outside_window`     — live session start outside ±2h
 *   - `session_not_found`
 *   - `dispute_not_found`
 *   - `already_closed`
 *   - `image_not_found`    — breed AI source image gone
 *   - `dog_not_found`
 *   - `too_close_to_now` / `too_far_in_future`
 *   - `slot_outside_availability`
 *   - `unknown`            — fallback when parsing fails
 */
export class CFError extends Error {
  constructor(
    public code: string,
    public status: number,
    public raw?: string,
  ) {
    super(code);
    this.name = 'CFError';
  }
}

/**
 * Call a Cloud Function as the currently-authenticated user. Adds the Firebase
 * ID token, posts JSON, parses the response.
 *
 * Throws `CFError` on any non-2xx so callers can `if (e instanceof CFError)`
 * and switch on `e.code` for tailored handling. Network failures and JSON
 * parse errors throw the original `Error` (caller can decide whether to
 * retry).
 */
export async function callCF<T = unknown>(
  name: string,
  body: unknown = {},
): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new CFError('unauthenticated', 401);

  const idToken = await user.getIdToken();
  const res = await fetch(cfUrl(name), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let code = 'unknown';
    let raw: string | null = null;
    try {
      raw = await res.text();
      const parsed = JSON.parse(raw);
      if (typeof parsed?.error === 'string') code = parsed.error;
    } catch {
      // Non-JSON body (e.g. HTML 404 from the gateway). Keep `code = 'unknown'`
      // and surface the raw blob so we can see it in console.
    }
    console.warn(`CF ${name} failed`, {
      status: res.status,
      code,
      raw: raw?.slice(0, 300),
    });
    throw new CFError(code, res.status, raw ?? undefined);
  }

  // 204 No Content or empty body → return undefined as T (callers that need
  // a real value should specify the type and inspect).
  const text = await res.text();
  if (!text) return undefined as unknown as T;
  return JSON.parse(text) as T;
}
