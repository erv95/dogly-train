import { doc, getDoc, setDoc, runTransaction, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

// ── XP per difficulty ─────────────────────────────────────────────────────────

export const XP_BY_DIFFICULTY: Record<string, number> = {
  very_basic:   15,
  basic:        25,
  intermediate: 40,
  advanced:     60,
  expert:       100,
};

// ── Course → difficulty (single source of truth) ──────────────────────────────
// Used by both UI screens and the recompute/auto-heal logic so XP is canonical.
// MUST stay in sync with the COURSES catalog in app/(shared)/courses.tsx — if
// you add a course id there, add it here too or auto-heal will silently
// truncate the user's XP back to the partial sum.
export const COURSE_DIFFICULTIES: Record<string, string> = {
  // Foundational
  sit:         'very_basic',
  lie:         'very_basic',
  name:        'very_basic',
  come:        'basic',
  stay:        'basic',
  leash:       'basic',
  leave_it:    'basic',
  fetch:       'basic',
  wait:        'basic',
  // Intermediate
  paw:         'intermediate',
  place:       'intermediate',
  settle:      'intermediate',
  heel:        'intermediate',
  shake:       'intermediate',
  spin:        'intermediate',
  high_five:   'intermediate',
  bow:         'intermediate',
  // Advanced
  distraction: 'advanced',
  drop:        'advanced',
  roll_over:   'advanced',
};

// Total XP achievable today by completing all 20 courses:
//   3×15 (very_basic) + 6×25 (basic) + 8×40 (intermediate) + 3×60 (advanced)
//   = 45 + 150 + 320 + 180 = 695 XP

// ── Level thresholds ──────────────────────────────────────────────────────────

// Thresholds calibrated for the 20-course catalog so reaching L5 ("Maestro")
// requires ~70% of total XP — meaningful progression without locking it out.
export const LEVELS = [
  { level: 1, minXp: 0,   maxXp: 49,       emoji: '🐾' },
  { level: 2, minXp: 50,  maxXp: 149,      emoji: '🦴' },
  { level: 3, minXp: 150, maxXp: 299,      emoji: '⭐' },
  { level: 4, minXp: 300, maxXp: 499,      emoji: '🎖️' },
  { level: 5, minXp: 500, maxXp: Infinity, emoji: '🏆' },
];

/**
 * Authoritative XP for a given list of completed course IDs.
 * - Deduplicates (defends against legacy data with duplicates)
 * - Ignores unknown course IDs (defends against renamed/removed courses)
 */
export function recomputeXpFromCompletedCourses(completedCourseIds: string[]): number {
  if (!Array.isArray(completedCourseIds) || completedCourseIds.length === 0) return 0;
  const unique = Array.from(new Set(completedCourseIds));
  let total = 0;
  for (const id of unique) {
    const diff = COURSE_DIFFICULTIES[id];
    if (diff && XP_BY_DIFFICULTY[diff] !== undefined) {
      total += XP_BY_DIFFICULTY[diff];
    }
  }
  return total;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DogStats {
  dogId: string;
  ownerId: string;
  xp: number;
  level: number;
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null; // YYYY-MM-DD
  completedCourseIds: string[];
  updatedAt: Timestamp;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function computeLevel(xp: number): number {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].minXp) return LEVELS[i].level;
  }
  return 1;
}

export function getLevelInfo(level: number) {
  return LEVELS.find((l) => l.level === level) ?? LEVELS[0];
}

export function xpForNextLevel(level: number): number {
  const next = LEVELS.find((l) => l.level === level + 1);
  return next?.minXp ?? Infinity;
}

// All date strings are UTC (ISO 8601: YYYY-MM-DD) to ensure consistency
// across timezones. Using UTC avoids midnight boundary issues where
// local and UTC days differ, which could break streak continuity.
function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function yesterdayStr(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split('T')[0];
}

// ── API ───────────────────────────────────────────────────────────────────────

export async function getDogStats(dogId: string): Promise<DogStats | null> {
  const ref = doc(db, 'dog_stats', dogId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as DogStats;

  // Auto-heal: recompute XP from the canonical course list. Wrapped in a
  // transaction so a concurrent updateStatsOnCourseComplete (which is also
  // transactional) cannot have its newly-awarded XP clobbered by this heal.
  const expectedXp = recomputeXpFromCompletedCourses(data.completedCourseIds ?? []);
  const expectedLevel = computeLevel(expectedXp);
  if (data.xp !== expectedXp || data.level !== expectedLevel) {
    return await runTransaction(db, async (tx) => {
      const fresh = await tx.get(ref);
      if (!fresh.exists()) return null;
      const cur = fresh.data() as DogStats;
      const xpNow = recomputeXpFromCompletedCourses(cur.completedCourseIds ?? []);
      const lvlNow = computeLevel(xpNow);
      // Re-check inside the transaction: if another writer already corrected
      // the values (or added more XP), accept their result instead of overwriting.
      if (cur.xp === xpNow && cur.level === lvlNow) return cur;
      const fixed: DogStats = {
        ...cur,
        xp: xpNow,
        level: lvlNow,
        completedCourseIds: Array.from(new Set(cur.completedCourseIds ?? [])),
        updatedAt: Timestamp.now(),
      };
      tx.set(ref, fixed);
      return fixed;
    });
  }
  return data;
}

/**
 * Called when a course is marked complete.
 * Updates XP, level, streak and completed list.
 * Returns the updated stats.
 */
export async function updateStatsOnCourseComplete(
  dogId: string,
  ownerId: string,
  courseId: string,
  difficulty: string
): Promise<DogStats> {
  const xpReward = XP_BY_DIFFICULTY[difficulty];
  if (xpReward === undefined) {
    throw new Error(`Unknown difficulty "${difficulty}" — cannot calculate XP`);
  }

  const statsRef = doc(db, 'dog_stats', dogId);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(statsRef);
    const existing = snap.exists() ? (snap.data() as DogStats) : null;

    const alreadyDone = existing?.completedCourseIds?.includes(courseId) ?? false;
    const xpGain = alreadyDone ? 0 : xpReward;
    const newXp = (existing?.xp ?? 0) + xpGain;
    const newLevel = computeLevel(newXp);

    // Streak
    const today = todayStr();
    const yesterday = yesterdayStr();
    const lastDate = existing?.lastActivityDate ?? null;
    let newStreak = existing?.currentStreak ?? 0;

    if (!lastDate) {
      newStreak = 1;
    } else if (lastDate === today) {
      // already counted today — no change
    } else if (lastDate === yesterday) {
      newStreak = newStreak + 1;
    } else {
      newStreak = 1; // streak broken
    }

    const newLongest = Math.max(existing?.longestStreak ?? 0, newStreak);
    const completedIds = alreadyDone
      ? (existing?.completedCourseIds ?? [])
      : [...(existing?.completedCourseIds ?? []), courseId];

    const stats: DogStats = {
      dogId,
      ownerId,
      xp: newXp,
      level: newLevel,
      currentStreak: newStreak,
      longestStreak: newLongest,
      lastActivityDate: today,
      completedCourseIds: completedIds,
      updatedAt: Timestamp.now(),
    };

    tx.set(statsRef, stats);
    return stats;
  });
}
