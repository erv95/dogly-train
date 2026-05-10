import { doc, updateDoc, getDocs, collection, query, where, limit, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { User } from '../types';
import { normalizeForSearch } from '../utils/search';

export interface UpdateProfileData {
  displayName?: string;
  photoURL?: string | null;
  language?: string;
  preferences?: User['preferences'];
}

/**
 * Search users by displayId (exact, case-insensitive) or displayName (prefix).
 * Excludes the current user from results.
 */
export async function searchUsers(queryStr: string, excludeUid: string): Promise<User[]> {
  const cleaned = queryStr.trim();
  if (!cleaned) return [];

  const results: Map<string, User> = new Map();

  // Helper: keep only active accounts (excludes banned/suspended)
  const acceptIfActive = (d: { id: string; data: () => any }) => {
    const data = d.data();
    if (d.id === excludeUid) return;
    if (data.status && data.status !== 'active') return;
    results.set(d.id, { id: d.id, ...data } as User);
  };

  // Firestore rules only allow READING trainer/caretaker docs whose
  // status == 'active' (chat search — broader than marketplace which also
  // requires isActive == true). Owners are private. Every query MUST
  // therefore include `role + status` filters — Firestore evaluates the rule
  // against the *result set*, not per-document, so any unfiltered query that
  // could include an unreadable doc gets rejected with permission-denied.

  // Search by displayId (strip leading # if present, uppercase).
  // We run two parallel queries per role: one by `status` (new accounts) and
  // one by `isActive` (legacy accounts that haven't been auto-healed yet).
  // The rule accepts both via "status == 'active' OR no status field".
  const idQuery = cleaned.startsWith('#')
    ? cleaned.slice(1).toUpperCase()
    : cleaned.toUpperCase();

  if (/^[A-Z0-9]{1,6}$/.test(idQuery)) {
    const buildById = (role: 'trainer' | 'caretaker', filterField: 'status' | 'isActive') =>
      query(
        collection(db, 'users'),
        where('role', '==', role),
        where(filterField, '==', filterField === 'status' ? 'active' : true),
        where('displayId', '==', idQuery),
        limit(5),
      );
    const settled = await Promise.allSettled([
      getDocs(buildById('trainer', 'status')),
      getDocs(buildById('caretaker', 'status')),
      getDocs(buildById('trainer', 'isActive')),
      getDocs(buildById('caretaker', 'isActive')),
    ]);
    for (const r of settled) {
      if (r.status === 'fulfilled') r.value.docs.forEach(acceptIfActive);
      else console.warn('ID sub-query failed', r.reason);
    }
  }

  // Search by displayName prefix.
  //
  // Hybrid strategy — handles both new and legacy accounts:
  //   1) Primary: query `displayNameLower` (lowercase + accent-stripped).
  //      Works for all users created after this feature shipped, plus legacy
  //      users that have been auto-healed on their next login.
  //   2) Fallback: query `displayName` directly with two casing variations
  //      (lowercase + capitalised). Catches legacy users that haven't logged
  //      in since the migration. Less robust (no accent stripping) but rescues
  //      the obvious cases like "Pepe" / "pepe" / "PEPE".
  // Results are merged into the same Map so duplicates collapse automatically.
  const buildEnd = (s: string) =>
    s.slice(0, -1) + String.fromCharCode(s.charCodeAt(s.length - 1) + 1);

  const normalizedQuery = normalizeForSearch(cleaned);
  const variations = new Set<string>([
    normalizedQuery,                    // "pepe"
    cleaned,                            // raw user input
    cleaned.toLowerCase(),              // "pepe"
    cleaned[0].toUpperCase() + cleaned.slice(1).toLowerCase(), // "Pepe"
    cleaned.toUpperCase(),              // "PEPE"
  ]);

  const queries: Array<ReturnType<typeof query>> = [];

  // Helper: build a query for a given role + filter field combination
  const makeNameQuery = (
    role: 'trainer' | 'caretaker',
    nameField: 'displayName' | 'displayNameLower',
    nameValue: string,
    filterField: 'status' | 'isActive',
  ) => query(
    collection(db, 'users'),
    where('role', '==', role),
    where(filterField, '==', filterField === 'status' ? 'active' : true),
    where(nameField, '>=', nameValue),
    where(nameField, '<', buildEnd(nameValue)),
    limit(10),
  );

  // Primary: displayNameLower (case-insensitive) — both filter strategies
  for (const role of ['trainer', 'caretaker'] as const) {
    for (const ff of ['status', 'isActive'] as const) {
      queries.push(makeNameQuery(role, 'displayNameLower', normalizedQuery, ff));
    }
  }
  // Fallback: displayName with multiple casings — both filter strategies.
  // This catches legacy accounts that haven't been auto-healed yet.
  for (const variant of variations) {
    if (!variant || variant === normalizedQuery) continue;
    for (const role of ['trainer', 'caretaker'] as const) {
      for (const ff of ['status', 'isActive'] as const) {
        queries.push(makeNameQuery(role, 'displayName', variant, ff));
      }
    }
  }

  // Run all queries in parallel; settle so a single failure (missing index,
  // permission edge) doesn't kill the whole search.
  const settled = await Promise.allSettled(queries.map((q) => getDocs(q)));
  for (const r of settled) {
    if (r.status === 'fulfilled') {
      r.value.docs.forEach(acceptIfActive);
    } else {
      console.warn('Name sub-query failed', r.reason);
    }
  }

  return Array.from(results.values()).slice(0, 10);
}

export async function updateUserProfile(
  userId: string,
  data: UpdateProfileData
): Promise<void> {
  // Keep displayNameLower in sync whenever displayName changes so the
  // case-insensitive search keeps working.
  const patch: Record<string, unknown> = { ...data, updatedAt: Timestamp.now() };
  if (typeof data.displayName === 'string') {
    patch.displayNameLower = normalizeForSearch(data.displayName);
  }
  await updateDoc(doc(db, 'users', userId), patch);
}
