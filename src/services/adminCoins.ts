import { callCF, CFError } from '../utils/cfClient';

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
  try {
    const data = await callCF<{ newBalance: number }>(
      'adminGrantCoins',
      { userId, amount, reason },
    );
    return data.newBalance;
  } catch (err) {
    if (err instanceof CFError) {
      // Map server-side error codes / messages to the GrantCoinsError shape
      // expected by the UI. Keep legacy mappings for older error texts.
      let code: GrantCoinsError = 'unknown';
      if (err.code === 'Admin only') code = 'admin_only';
      else if (err.code === 'user_not_found') code = 'user_not_found';
      else if (err.code === 'would_go_negative') code = 'would_go_negative';
      else if (err.code.includes?.('Amount')) code = 'invalid_amount';
      else if (err.code === 'unauthenticated') code = 'unauthenticated';
      throw new Error(code);
    }
    throw err;
  }
}
