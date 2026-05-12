import { callCF } from '../utils/cfClient';

/** Revoke ALL refresh tokens for the current user (including this device).
 *  After ~1h max, every device — including this one — will be force-logged out
 *  on the next ID token refresh. Caller is responsible for calling
 *  `signOut()` afterwards to drop the local session immediately. */
export async function revokeAllSessions(): Promise<void> {
  await callCF('revokeAllSessions');
}

/** Cancel a pending soft-delete. Only succeeds while account is in
 *  `pending_deletion` status AND the scheduled date hasn't passed. */
export async function restoreAccount(): Promise<void> {
  await callCF('restoreAccount');
}
