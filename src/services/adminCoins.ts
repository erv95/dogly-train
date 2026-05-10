import { auth } from '../config/firebase';

const FUNCTION_URL = 'https://us-central1-dogly-train.cloudfunctions.net/adminGrantCoins';

export type GrantCoinsError =
  | 'unauthenticated'
  | 'admin_only'
  | 'user_not_found'
  | 'would_go_negative'
  | 'invalid_amount'
  | 'unknown';

/** Admin-only: grant `amount` coins to `userId` (or subtract if negative).
 *  Resolves with the user's new balance. Throws Error with .message set to
 *  one of `GrantCoinsError` for the UI to map. */
export async function adminGrantCoins(
  userId: string,
  amount: number,
  reason?: string,
): Promise<number> {
  const user = auth.currentUser;
  if (!user) throw new Error('unauthenticated');
  const idToken = await user.getIdToken();

  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ userId, amount, reason }),
  });

  if (!res.ok) {
    let code: GrantCoinsError = 'unknown';
    let raw: string | null = null;
    try {
      raw = await res.text();
      const data = JSON.parse(raw);
      if (typeof data?.error === 'string') {
        if (data.error === 'Admin only') code = 'admin_only';
        else if (data.error === 'user_not_found') code = 'user_not_found';
        else if (data.error === 'would_go_negative') code = 'would_go_negative';
        else if (data.error.includes('Amount')) code = 'invalid_amount';
      }
    } catch { /* response wasn't JSON (e.g. 404 HTML body) */ }
    // Log full diagnostic info so console errors show what really failed.
    console.warn('adminGrantCoins failed', {
      status: res.status,
      mappedCode: code,
      body: raw?.slice(0, 300),
    });
    throw new Error(code);
  }
  const data = await res.json();
  return data.newBalance as number;
}
