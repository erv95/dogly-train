import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  limit,
  Unsubscribe,
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { Dispute, DisputeReason, DisputeStatus } from '../types';

const OPEN_DISPUTE_URL =
  'https://us-central1-dogly-train.cloudfunctions.net/openDispute';
const RESOLVE_DISPUTE_URL =
  'https://us-central1-dogly-train.cloudfunctions.net/adminResolveDispute';

export type OpenDisputeError =
  | 'unauthenticated'
  | 'invalid_bookingId'
  | 'invalid_reason'
  | 'invalid_description'
  | 'booking_not_found'
  | 'forbidden'
  | 'rate_limited'
  | 'unknown';

async function callCF(url: string, body: any): Promise<any> {
  const user = auth.currentUser;
  if (!user) throw new Error('unauthenticated');
  const idToken = await user.getIdToken();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let code = 'unknown';
    try {
      const d = await res.json();
      if (typeof d?.error === 'string') code = d.error;
    } catch { /* ignore */ }
    throw new Error(code);
  }
  return res.json();
}

export async function openDispute(
  bookingId: string,
  reason: DisputeReason,
  description: string,
): Promise<{ disputeId: string; alreadyOpen?: boolean }> {
  return callCF(OPEN_DISPUTE_URL, { bookingId, reason, description });
}

export async function adminResolveDispute(
  disputeId: string,
  status: 'resolved' | 'rejected',
  resolution: string,
): Promise<void> {
  await callCF(RESOLVE_DISPUTE_URL, { disputeId, status, resolution });
}

/** Returns all dispute docs that mention this booking (either side could
 *  have opened one). Used in the booking detail screen. */
export async function getDisputesForBooking(bookingId: string): Promise<Dispute[]> {
  const q = query(collection(db, 'disputes'), where('bookingId', '==', bookingId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Dispute));
}

export function subscribeAdminDisputes(
  status: DisputeStatus,
  cb: (list: Dispute[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'disputes'),
    where('status', '==', status),
    orderBy('createdAt', 'desc'),
    limit(50),
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Dispute)));
  });
}

export async function getDisputeById(disputeId: string): Promise<Dispute | null> {
  const snap = await getDoc(doc(db, 'disputes', disputeId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Dispute) : null;
}
