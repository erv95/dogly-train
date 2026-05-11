import { auth } from '../config/firebase';

const REVOKE_URL = 'https://us-central1-dogly-train.cloudfunctions.net/revokeAllSessions';
const RESTORE_URL = 'https://us-central1-dogly-train.cloudfunctions.net/restoreAccount';

/** Revoke ALL refresh tokens for the current user (including this device).
 *  After ~1h max, every device — including this one — will be force-logged out
 *  on the next ID token refresh. Caller is responsible for calling
 *  `signOut()` afterwards to drop the local session immediately. */
export async function revokeAllSessions(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('unauthenticated');
  const idToken = await user.getIdToken();
  const res = await fetch(REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    let code = 'unknown';
    try {
      const data = await res.json();
      if (typeof data?.error === 'string') code = data.error;
    } catch { /* not JSON */ }
    throw new Error(code);
  }
}

/** Cancel a pending soft-delete. Only succeeds while account is in
 *  `pending_deletion` status AND the scheduled date hasn't passed. */
export async function restoreAccount(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('unauthenticated');
  const idToken = await user.getIdToken();
  const res = await fetch(RESTORE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    let code = 'unknown';
    try {
      const data = await res.json();
      if (typeof data?.error === 'string') code = data.error;
    } catch { /* not JSON */ }
    throw new Error(code);
  }
}
