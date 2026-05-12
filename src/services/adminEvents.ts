import {
  collection,
  query,
  orderBy,
  limit,
  where,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * `security_events` audit log. Surface to admins only — sensitive operational
 * data (per-user revoke counts, data-export rate, dispute openings, deletion
 * requests). Rules deny read to non-admins.
 */

export type SecurityEventType =
  | 'revoke_all_sessions'
  | 'data_export'
  | 'dispute_opened'
  | 'account_deletion_requested'
  | 'account_deletion_cancelled'
  | string; // fallback for future types added server-side

export interface SecurityEvent {
  id: string;
  userId: string;
  type: SecurityEventType;
  createdAt: Timestamp;
  ip?: string | null;
  userAgent?: string | null;
  disputeId?: string;
  bookingId?: string;
  [extra: string]: unknown;
}

/** Latest N security events, newest first. Optional filter by type. */
export async function listSecurityEvents(
  options: { type?: SecurityEventType; max?: number } = {},
): Promise<SecurityEvent[]> {
  const max = options.max ?? 50;
  const constraints = [orderBy('createdAt', 'desc'), limit(max)];
  if (options.type) {
    constraints.unshift(where('type', '==', options.type) as any);
  }
  const snap = await getDocs(query(collection(db, 'security_events'), ...constraints));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SecurityEvent);
}
