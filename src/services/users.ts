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
  // status == 'active'. Owners are private. Every query MUST include
  // `role + status` filters or rules reject with permission-denied.
  //
  // We collapsed an older hybrid strategy (status + isActive, multi-casing
  // displayName fallbacks) into a single canonical query per role+search
  // type. AuthContext now auto-heals `status` + `displayNameLower` on first
  // login, so legacy accounts converge — keeping the fallback queries was
  // costing ~24 queries per keystroke for a vanishing minority of users.
  // Worst-case: an unheaaled legacy account is not found until its owner
  // logs in once.

  const queries: Array<ReturnType<typeof query>> = [];

  // Search by displayId (exact, uppercase, leading # stripped).
  const idQuery = cleaned.startsWith('#')
    ? cleaned.slice(1).toUpperCase()
    : cleaned.toUpperCase();
  if (/^[A-Z0-9]{1,6}$/.test(idQuery)) {
    for (const role of ['trainer', 'caretaker'] as const) {
      queries.push(query(
        collection(db, 'users'),
        where('role', '==', role),
        where('status', '==', 'active'),
        where('displayId', '==', idQuery),
        limit(5),
      ));
    }
  }

  // Search by displayName prefix using the normalised (lowercase, accent-
  // stripped) field — case-insensitive and handles diacritics. The
  // upper-bound trick mirrors Firestore's startsWith pattern.
  const normalizedQuery = normalizeForSearch(cleaned);
  if (normalizedQuery) {
    const upperBound = normalizedQuery.slice(0, -1)
      + String.fromCharCode(normalizedQuery.charCodeAt(normalizedQuery.length - 1) + 1);
    for (const role of ['trainer', 'caretaker'] as const) {
      queries.push(query(
        collection(db, 'users'),
        where('role', '==', role),
        where('status', '==', 'active'),
        where('displayNameLower', '>=', normalizedQuery),
        where('displayNameLower', '<', upperBound),
        limit(10),
      ));
    }
  }

  // Run in parallel; settle so a single failure (missing index, permission
  // edge for a banned user) doesn't kill the whole search.
  const settled = await Promise.allSettled(queries.map((q) => getDocs(q)));
  for (const r of settled) {
    if (r.status === 'fulfilled') {
      r.value.docs.forEach(acceptIfActive);
    } else {
      console.warn('searchUsers sub-query failed', r.reason);
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

/**
 * Merge-patch a subset of `User.preferences` without overwriting other
 * preference keys. Firestore's default `update` REPLACES nested objects,
 * so we read the current preferences and merge in JS — slightly more
 * expensive than a transaction but safe for single-user writes and
 * avoids the dot-notation footgun (Firestore dot-notation only works
 * with primitive nested values, not with TypeScript-typed sub-objects).
 *
 * Used by parent-type (Iter 8.4) and the tutorial completion flag (8.6).
 */
export async function updateUserPreferences(
  userId: string,
  patch: Partial<NonNullable<User['preferences']>>,
): Promise<void> {
  // Build dotted-path patch so we only touch the keys we care about and
  // leave unrelated preference fields intact. Firestore accepts dotted
  // paths in updateDoc for nested map updates.
  const update: Record<string, unknown> = { updatedAt: Timestamp.now() };
  for (const [k, v] of Object.entries(patch)) {
    update[`preferences.${k}`] = v;
  }
  await updateDoc(doc(db, 'users', userId), update);
}
