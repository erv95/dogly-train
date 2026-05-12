import {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  updateDoc,
  serverTimestamp,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { callCF } from '../utils/cfClient';
import { User, UserRole, UserStatus } from '../types';
import { normalizeForSearch } from '../utils/search';

// ── Filter / sort types ──────────────────────────────────────────────────────

export type RoleFilter = 'all' | UserRole;
export type StatusFilter = 'all' | UserStatus;
export type DateFilter = 'all' | '7d' | '30d' | '90d';
export type SortBy = 'createdDesc' | 'createdAsc' | 'nameAsc' | 'nameDesc';

export interface ListUsersFilters {
  role?: RoleFilter;
  status?: StatusFilter;
  date?: DateFilter;
  searchText?: string;
  sortBy?: SortBy;
  pageSize?: number;
  cursor?: QueryDocumentSnapshot<DocumentData> | null;
}

export interface ListUsersResult {
  items: User[];
  nextCursor: QueryDocumentSnapshot<DocumentData> | null;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 30;

function dateFilterToCutoff(date: DateFilter): Date | null {
  if (date === 'all') return null;
  const days = date === '7d' ? 7 : date === '30d' ? 30 : 90;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff;
}

function buildOrderBy(sortBy: SortBy) {
  switch (sortBy) {
    case 'createdDesc': return orderBy('createdAt', 'desc');
    case 'createdAsc':  return orderBy('createdAt', 'asc');
    case 'nameAsc':     return orderBy('displayName', 'asc');
    case 'nameDesc':    return orderBy('displayName', 'desc');
  }
}

/**
 * Apply post-fetch filters that we deliberately keep client-side to avoid an
 * explosion of Firestore composite indexes (status, date, search). The page
 * size is small (default 30) so client filtering stays cheap.
 */
function applyClientFilters(items: User[], filters: ListUsersFilters): User[] {
  let out = items;
  if (filters.status && filters.status !== 'all') {
    out = out.filter((u) => (u.status ?? 'active') === filters.status);
  }
  const cutoff = dateFilterToCutoff(filters.date ?? 'all');
  if (cutoff) {
    const cutoffMs = cutoff.getTime();
    out = out.filter((u) => {
      const created = (u.createdAt as any)?.toDate?.()?.getTime?.() ?? 0;
      return created >= cutoffMs;
    });
  }
  const search = (filters.searchText ?? '').trim();
  if (search) {
    const normalized = normalizeForSearch(search);
    out = out.filter((u) => {
      const haystack = [
        u.displayNameLower ?? normalizeForSearch(u.displayName ?? ''),
        (u.email ?? '').toLowerCase(),
        (u.displayId ?? '').toLowerCase(),
      ].join(' ');
      return haystack.includes(normalized);
    });
  }
  return out;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Paginated user listing for admin. Server-side filters: role + sort.
 * Other filters (status, date, search) run client-side over the page —
 * acceptable for admin scale (up to a few thousand users).
 */
export async function listUsers(filters: ListUsersFilters = {}): Promise<ListUsersResult> {
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const sortBy = filters.sortBy ?? 'createdDesc';

  const constraints: QueryConstraint[] = [];
  if (filters.role && filters.role !== 'all') {
    constraints.push(where('role', '==', filters.role));
  }
  constraints.push(buildOrderBy(sortBy));
  if (filters.cursor) constraints.push(startAfter(filters.cursor));
  constraints.push(limit(pageSize));

  const snap = await getDocs(query(collection(db, 'users'), ...constraints));
  const rawItems = snap.docs.map((d) => ({ id: d.id, ...d.data() } as User));
  const filtered = applyClientFilters(rawItems, filters);
  const nextCursor = snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1] : null;

  return { items: filtered, nextCursor };
}

/**
 * Update a user's `status` (active/suspended/banned). Admin-only via rules.
 * No transaction needed — single field update.
 */
export async function updateUserStatus(uid: string, newStatus: UserStatus): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    status: newStatus,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Toggle a trainer/caretaker's marketplace visibility (`isActive` flag).
 * Same end-effect as the existing `handleToggleActive` in admin.tsx but
 * exposed here so the new modal can call it through the same service layer.
 */
export async function setUserMarketplaceActive(uid: string, isActive: boolean): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    isActive,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Change a user's role. Caller is expected to confirm with the operator
 * because the destination role-specific fields will be incomplete and the
 * user must complete their profile on next login.
 */
export async function updateUserRole(uid: string, newRole: UserRole): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    role: newRole,
    updatedAt: serverTimestamp(),
  });
}

// ── Admin: force-resync of denormalised data ─────────────────────────────────
//
// Used to fix legacy stale data — e.g. a user who renamed before the
// `onUserUpdate` trigger was deployed. Replays the propagation of
// displayName/photoURL/bizumPhone to all chats and active bookings of that
// user. Returns the number of docs updated.

export type AdminSyncResult = { chats: number; bookings: number };

export async function adminSyncUserDenormalized(userId: string): Promise<AdminSyncResult> {
  const data = await callCF<{ chats?: number; bookings?: number }>(
    'adminSyncUserDenormalized',
    { userId },
  );
  return { chats: data.chats ?? 0, bookings: data.bookings ?? 0 };
}
