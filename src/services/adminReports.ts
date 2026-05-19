import {
  collection,
  limit,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Realtime count of pending user-submitted reports, for the admin tab badge.
 * Same permission-denied auto-teardown pattern as subscribeToUnreadCount in
 * chats.ts.
 */
export function subscribeToPendingReportsCount(
  callback: (count: number) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'reports'),
    where('status', '==', 'pending'),
    limit(100),
  );
  let unsubInternal: Unsubscribe | null = null;
  unsubInternal = onSnapshot(
    q,
    (snap) => callback(snap.size),
    (err) => {
      console.warn('subscribeToPendingReportsCount error:', err);
      if ((err as { code?: string }).code === 'permission-denied') {
        unsubInternal?.();
      }
    },
  );
  return () => unsubInternal?.();
}
