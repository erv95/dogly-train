import { Dog, DogIssue, DogReminder, DogWalk, ReminderType } from '../types';
import { DogStats, computeLevel, xpForNextLevel, COURSE_DIFFICULTIES } from './dogStats';
import { COURSE_META } from '../data/courseMeta';
import { rankCourses, ScoreableCourse } from './courseRecommendations';
import { hasWalkedToday } from './dogWalks';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DailyRecommendation =
  | {
      kind: 'reminder';
      reminderId: string;
      title: string;
      reminderType: ReminderType;
      daysUntil: number;
      overdue: boolean;
    }
  | {
      kind: 'course';
      courseId: string;
      emoji: string;
      difficulty: string;
      reasonKey: 'plan_match' | 'next_step' | 'review';
    }
  | {
      kind: 'guide';
      issueId: Exclude<DogIssue, 'other'>;
    }
  | {
      kind: 'streak';
      currentStreak: number;
    }
  | {
      kind: 'level_progress';
      currentLevel: number;
      currentXp: number;
      xpToNext: number;
    }
  | {
      kind: 'no_plan';
    }
  | {
      kind: 'walk_today';
      lastWalkDays: number | null; // null = never walked, otherwise days since last walk
    }
  | {
      kind: 'progress_summary';
      coursesCompleted: number;
      level: number;
    }
  | {
      kind: 'daily_tip';
      tipIndex: number; // 0..N-1, caller resolves to localized string from `daily.tips`
    }
  | {
      kind: 'emergency_setup';
    };

export interface DailyContext {
  dog: Dog;
  stats: DogStats | null;
  reminders: DogReminder[];
  /** Recent walks (last 30 days is enough; sorted desc by startedAt). */
  walks?: DogWalk[];
  /** True if the user has at least one emergency contact configured.
   *  Undefined = unknown (rail hasn't loaded yet); we skip the prompt then. */
  hasEmergencyContacts?: boolean;
  /** Used as a deterministic seed so the order varies per day but stays stable
   *  within the same day (no flicker on re-renders). */
  now: Date;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysBetween(from: Date, to: Date): number {
  const a = new Date(from); a.setHours(0, 0, 0, 0);
  const b = new Date(to);   b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function dayOfYearSeed(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// ── Greeting ──────────────────────────────────────────────────────────────────

export type GreetingSlot = 'goodMorning' | 'goodAfternoon' | 'goodEvening' | 'goodNight';

export function getGreetingSlot(now: Date): GreetingSlot {
  const h = now.getHours();
  if (h < 6) return 'goodNight';
  if (h < 12) return 'goodMorning';
  if (h < 19) return 'goodAfternoon';
  return 'goodEvening';
}

// ── Main scoring ──────────────────────────────────────────────────────────────

/**
 * Build today's recommendation cards for a single dog. Pure function — caller
 * provides all the context data already loaded from Firestore. Order matters:
 * earlier items are rendered first (most prominent).
 *
 * Limit: 5 cards max. Skips any card type that doesn't apply to the dog.
 */
export function getDailyRecommendations(ctx: DailyContext): DailyRecommendation[] {
  const out: DailyRecommendation[] = [];
  const completedSet = new Set(ctx.stats?.completedCourseIds ?? []);
  const seed = dayOfYearSeed(ctx.now);

  // 1. Most urgent reminder (overdue, today, or tomorrow)
  const urgent = ctx.reminders
    .map((r) => ({ r, days: daysBetween(ctx.now, r.dueAt.toDate()) }))
    .filter((x) => x.days <= 1)
    .sort((a, b) => a.days - b.days);
  if (urgent.length > 0) {
    const { r, days } = urgent[0];
    out.push({
      kind: 'reminder',
      reminderId: r.id,
      title: r.title,
      reminderType: r.type,
      daysUntil: days,
      overdue: days < 0,
    });
  }

  // 2. Course recommendation — top of rankCourses if trainingPrefs exist,
  //    otherwise the next "natural" course based on prerequisites and progress.
  const allCourseIds = Object.keys(COURSE_META);
  const scoreables: ScoreableCourse[] = allCourseIds.map((id) => ({
    id,
    difficulty: COURSE_META[id].difficulty,
    duration: '5 min', // approximation; real duration is in locale, doesn't matter for scoring
  }));
  if (ctx.dog.trainingPrefs) {
    const ranked = rankCourses(scoreables, ctx.dog.trainingPrefs, [...completedSet]);
    const top = ranked.find((r) => !completedSet.has(r.course.id));
    if (top) {
      const meta = COURSE_META[top.course.id];
      out.push({
        kind: 'course',
        courseId: top.course.id,
        emoji: meta.emoji,
        difficulty: meta.difficulty,
        reasonKey: 'plan_match',
      });
    }
  } else {
    // No plan: suggest the first not-completed course whose prerequisites are met.
    const next = allCourseIds.find((id) => {
      if (completedSet.has(id)) return false;
      const meta = COURSE_META[id];
      return meta.prerequisites.every((p) => completedSet.has(p));
    });
    if (next) {
      const meta = COURSE_META[next];
      out.push({
        kind: 'course',
        courseId: next,
        emoji: meta.emoji,
        difficulty: meta.difficulty,
        reasonKey: 'next_step',
      });
    } else if (completedSet.size > 0) {
      // All available courses with met prereqs are done — suggest review of last completed
      const reviewId = [...completedSet][completedSet.size - 1];
      const meta = COURSE_META[reviewId];
      if (meta) {
        out.push({
          kind: 'course',
          courseId: reviewId,
          emoji: meta.emoji,
          difficulty: meta.difficulty,
          reasonKey: 'review',
        });
      }
    }
  }

  // 3. Behavior guide if dog has issues — rotate one per day
  const issues = (ctx.dog.issues ?? []).filter((i): i is Exclude<DogIssue, 'other'> => i !== 'other');
  if (issues.length > 0) {
    const issueId = issues[seed % issues.length];
    out.push({ kind: 'guide', issueId });
  }

  // 4. Streak motivation if current streak >= 2
  if ((ctx.stats?.currentStreak ?? 0) >= 2) {
    out.push({ kind: 'streak', currentStreak: ctx.stats!.currentStreak });
  }

  // 5. Level-progress nudge if close to next level (within 50 XP)
  if (ctx.stats) {
    const xp = ctx.stats.xp;
    const currentLvl = computeLevel(xp);
    const next = xpForNextLevel(currentLvl);
    if (next !== Infinity) {
      const remaining = next - xp;
      if (remaining > 0 && remaining <= 50) {
        out.push({
          kind: 'level_progress',
          currentLevel: currentLvl,
          currentXp: xp,
          xpToNext: remaining,
        });
      }
    }
  }

  // 6. Walk reminder: in the afternoon/evening, if the dog hasn't walked today
  //    and the user has logged walks before (so they actually use this feature)
  const walks = ctx.walks ?? [];
  const hour = ctx.now.getHours();
  if (walks.length > 0 && hour >= 16 && !hasWalkedToday(walks, ctx.now)) {
    const lastDate = walks[0]?.date ?? null;
    let lastWalkDays: number | null = null;
    if (lastDate) {
      const last = new Date(lastDate + 'T00:00:00Z');
      lastWalkDays = daysBetween(last, ctx.now);
    }
    out.push({ kind: 'walk_today', lastWalkDays });
  }

  // 7. Emergency-setup prompt — one-shot until the user adds a contact.
  //    Shown right after the most urgent reminder (if any) so it stays visible
  //    but doesn't bury reminders/courses.
  if (ctx.hasEmergencyContacts === false) {
    out.push({ kind: 'emergency_setup' });
  }

  // 7b. Progress summary card if the dog has tangible progress
  const completedCount = (ctx.stats?.completedCourseIds ?? []).length;
  if (completedCount >= 3 && ctx.stats) {
    out.push({
      kind: 'progress_summary',
      coursesCompleted: completedCount,
      level: ctx.stats.level,
    });
  }

  // 8. Daily training tip (rotates by day-of-year). Always last so it doesn't
  //    push more relevant suggestions out of the cap.
  // The number of available tips lives in the locale (daily.tips array). Caller
  // wraps tipIndex modulo the actual length when rendering.
  out.push({ kind: 'daily_tip', tipIndex: seed });

  // 9. If we have nothing personalised (no plan, no issues, no progress) — prompt the plan
  if (out.length === 1 && !ctx.dog.trainingPrefs) {
    // out only has the tip → still prompt the plan as the first card
    out.unshift({ kind: 'no_plan' });
  }

  return out.slice(0, 6);
}
