import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  doc,
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { Referral, User } from '../types';

const RECORD_SIGNUP_URL = 'https://us-central1-dogly-train.cloudfunctions.net/recordReferralSignup';

/** Called from register.tsx right after sign-up to register the referral with
 *  the user's real IP (so the Cloud Function can hash it for the audit). */
export async function recordReferralSignup(referralCode: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const idToken = await user.getIdToken();
  await fetch(RECORD_SIGNUP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ referredCode: referralCode }),
  }).catch(() => {
    // Silent — referrals are a nice-to-have, never block the signup flow
  });
}

/** Look up a user by their `displayId` (referral code). Returns null if no
 *  match — used by register.tsx to validate the entered code without leaking
 *  whether the referrer is owner/trainer/etc. */
export async function lookupReferralCode(code: string): Promise<{ id: string; displayName: string } | null> {
  const cleaned = code.trim().toUpperCase();
  if (!cleaned || cleaned.length < 4) return null;
  const q = query(
    collection(db, 'users'),
    where('displayId', '==', cleaned),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const u = snap.docs[0];
  const data = u.data() as User;
  return { id: u.id, displayName: data.displayName };
}

/** All referrals where the current user is the referrer. Most-recent first. */
export async function getMyReferrals(uid: string): Promise<Referral[]> {
  const q = query(
    collection(db, 'referrals'),
    where('referrerId', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(100),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Referral));
}

export interface ReferralStats {
  total: number;
  claimed: number;
  pending: number;
  coinsEarned: number;
}

export async function getReferralStats(uid: string): Promise<ReferralStats> {
  const refs = await getMyReferrals(uid);
  const claimed = refs.filter((r) => r.status === 'claimed').length;
  const pending = refs.filter((r) => r.status === 'pending' || r.status === 'review').length;
  // 30 coins per claimed referral — keep in sync with REFERRAL_BONUS_COINS
  // server-side. UI is decorative; the ledger is the source of truth.
  return {
    total: refs.length,
    claimed,
    pending,
    coinsEarned: claimed * 30,
  };
}

/** Read the user doc by uid — used by referrals.tsx to display the user's
 *  own referral code (= displayId). */
export async function getReferrerDisplayId(uid: string): Promise<string | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  const data = snap.data() as User;
  return data.displayId ?? null;
}
