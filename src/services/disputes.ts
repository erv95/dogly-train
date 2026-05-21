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
import { db } from '../config/firebase';
import { callCF } from '../utils/cfClient';
import { Dispute, DisputeReason, DisputeStatus } from '../types';

export type OpenDisputeError =
  | 'unauthenticated'
  | 'invalid_bookingId'
  | 'invalid_reason'
  | 'invalid_description'
  | 'booking_not_found'
  | 'forbidden'
  | 'rate_limited'
  | 'unknown';

export async function openDispute(
  bookingId: string,
  reason: DisputeReason,
  description: string,
): Promise<{ disputeId: string; alreadyOpen?: boolean }> {
  return callCF('openDispute', { bookingId, reason, description });
}

export async function adminResolveDispute(
  disputeId: string,
  status: 'resolved' | 'rejected',
  resolution: string,
): Promise<void> {
  await callCF('adminResolveDispute', { disputeId, status, resolution });
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
  let unsubInternal: Unsubscribe | null = null;
  unsubInternal = onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Dispute))),
    (err) => {
      console.warn('subscribeAdminDisputes error:', (err as any)?.code ?? err);
      // Auto-teardown when admin claim is revoked mid-session so we don't
      // burn reads retrying a query the listener can no longer execute.
      if ((err as { code?: string }).code === 'permission-denied') {
        unsubInternal?.();
      }
    },
  );
  return () => unsubInternal?.();
}

export async function getDisputeById(disputeId: string): Promise<Dispute | null> {
  const snap = await getDoc(doc(db, 'disputes', disputeId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Dispute) : null;
}

/**
 * Realtime count of open disputes, for the admin tab badge. Same
 * permission-denied auto-teardown as subscribeToUnreadCount in chats.ts.
 */
export function subscribeToOpenDisputesCount(
  callback: (count: number) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'disputes'),
    where('status', '==', 'open'),
    limit(100),
  );
  let unsubInternal: Unsubscribe | null = null;
  unsubInternal = onSnapshot(
    q,
    (snap) => callback(snap.size),
    (err) => {
      console.warn('subscribeToOpenDisputesCount error:', err);
      if ((err as { code?: string }).code === 'permission-denied') {
        unsubInternal?.();
      }
    },
  );
  return () => unsubInternal?.();
}
