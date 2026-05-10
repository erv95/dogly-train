import {
  collection,
  doc,
  getDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  Dog,
  DogIssue,
  TrainingPrefs,
  WeeklyPlan,
  WeeklyDay,
  WeeklyActivity,
  WeeklyActivityKind,
} from '../types';
import { COURSE_META } from '../data/courseMeta';

const COLLECTION = 'weekly_plans';

// ── Week math (ISO 8601, Monday-based) ───────────────────────────────────────

/** Returns the Monday-00:00 UTC at the start of the ISO week of `d`. */
export function startOfIsoWeekUtc(d: Date): Date {
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay();             // 0 = Sun, 1 = Mon, …
  const offset = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + offset);
  return utc;
}

/** ISO week number (1-53) for a given date. */
function isoWeekNumber(d: Date): number {
  // Copy and shift to Thursday of current week (ISO trick).
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = (target.getTime() - firstThursday.getTime()) / 86400000;
  return 1 + Math.round((diff - ((firstThursday.getUTCDay() + 6) % 7) + 3) / 7);
}

/** ISO year (may differ from calendar year for ISO weeks 1, 52, 53). */
function isoYear(d: Date): number {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  target.setUTCDate(target.getUTCDate() + 4 - ((target.getUTCDay() + 6) % 7));
  return target.getUTCFullYear();
}

/** ISO week label like '2026-W19' — used as the deterministic key. */
export function weekIsoLabel(d: Date): string {
  const y = isoYear(d);
  const w = isoWeekNumber(d);
  return `${y}-W${w.toString().padStart(2, '0')}`;
}

export function planDocId(dogId: string, weekIso: string): string {
  return `${dogId}_${weekIso}`;
}

export function addWeeks(d: Date, n: number): Date {
  const copy = new Date(d.getTime());
  copy.setUTCDate(copy.getUTCDate() + n * 7);
  return copy;
}

// ── Generation ───────────────────────────────────────────────────────────────

const MENTAL_REFS: Array<NonNullable<WeeklyActivity['mentalRef']>> = [
  'clicker', 'scent', 'name_game', 'enrichment',
];

function ageMonthsFromYears(years: number): number {
  return Math.max(0, Math.round(years * 12));
}

function pickWalkMinutes(ageMonths: number, idx: number): number {
  // Puppies: short walks, more frequent.
  // Adults/young: 30-45 min default.
  // Seniors: 20-30 min easy.
  if (ageMonths < 6) return 10 + (idx % 2) * 5;        // 10/15
  if (ageMonths < 18) return 20 + (idx % 3) * 10;       // 20/30/40
  if (ageMonths < 96) return 30 + (idx % 3) * 10;       // 30/40/50
  return 20 + (idx % 2) * 5;                            // 20/25 senior
}

function activitiesPerDay(timeAvailable?: TrainingPrefs['timeAvailable']): number {
  if (timeAvailable === 'short') return 2;
  if (timeAvailable === 'long') return 4;
  return 3;
}

function trainingMinutesFor(timeAvailable?: TrainingPrefs['timeAvailable']): number {
  if (timeAvailable === 'short') return 5;
  if (timeAvailable === 'long') return 20;
  return 10;
}

interface GenerationContext {
  dog: Dog;
  prefs?: TrainingPrefs;
  /** Course IDs the dog has already completed at least once. Used to weave in
   *  reviews of mastered skills + suggest the next tier. */
  completedCourseIds: string[];
}

/** Pure plan generator. Deterministic given (dog, prefs, completed, weekIso) so
 *  that opening the same week twice (without saving) yields the same plan. */
export function generateWeekActivities(
  ctx: GenerationContext,
  weekIso: string,
): WeeklyDay[] {
  const ageMonths = ageMonthsFromYears(ctx.dog.age);
  const timeAvailable = ctx.prefs?.timeAvailable;
  const perDay = activitiesPerDay(timeAvailable);
  const trainingMin = trainingMinutesFor(timeAvailable);

  // Course pool: prefer uncompleted matches for level/age, fall back to review of
  // mastered ones. We don't import the heavy ranker here; the weekly plan is
  // intentionally simpler.
  const eligibleByAge = Object.values(COURSE_META)
    .filter((c) => c.minAgeMonths <= ageMonths)
    .map((c) => c.id);
  const completed = new Set(ctx.completedCourseIds);
  const uncompleted = eligibleByAge.filter((id) => !completed.has(id));
  const reviewable = eligibleByAge.filter((id) => completed.has(id));

  // Build a stable sequence using weekIso as the seed (so each week rotates).
  const weekHash = weekIso
    .split('')
    .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 0);

  const courseSequence: string[] = [];
  // 4 days of "next-step" courses, interleaved with 2 days of review.
  const upcoming = uncompleted.length > 0 ? uncompleted : reviewable;
  for (let i = 0; i < 14; i++) {
    const useReview = i % 3 === 2 && reviewable.length > 0;
    const pool = useReview ? reviewable : (upcoming.length > 0 ? upcoming : reviewable);
    if (pool.length === 0) break;
    courseSequence.push(pool[(weekHash + i) % pool.length]);
  }

  const issues: DogIssue[] = (ctx.prefs?.issues ?? []) as DogIssue[];
  const issueRotation = issues.filter((i) => i !== 'other');

  const days: WeeklyDay[] = [];
  let courseIdx = 0;

  for (let d = 0; d < 7; d++) {
    const isRestDay = ageMonths >= 96 && d === 6;       // senior dog: Sunday rest
    const activities: WeeklyActivity[] = [];

    if (isRestDay) {
      activities.push({
        id: `${d}-rest-0`,
        kind: 'rest',
        titleKey: 'rest_day',
        estimatedMinutes: 0,
        completed: false,
      });
    } else {
      // 1) Walk every non-rest day.
      const walkMin = pickWalkMinutes(ageMonths, d);
      activities.push({
        id: `${d}-walk-0`,
        kind: 'walk',
        walkMinutes: walkMin,
        titleKey: walkMin >= 40 ? 'long_walk' : walkMin <= 15 ? 'short_walk' : 'walk',
        estimatedMinutes: walkMin,
        completed: false,
      });

      // 2) Training session (1-2 courses depending on perDay)
      const courseCount = perDay >= 4 ? 2 : 1;
      for (let k = 0; k < courseCount && courseSequence.length > 0; k++) {
        const courseId = courseSequence[(courseIdx++) % courseSequence.length];
        activities.push({
          id: `${d}-training-${k}`,
          kind: 'training',
          courseId,
          titleKey: 'practice_course',
          estimatedMinutes: trainingMin,
          completed: false,
        });
      }

      // 3) Mental stim or guide on alternate days when slot available
      if (activities.length < perDay) {
        if ((d + (weekHash % 2)) % 2 === 0 && issueRotation.length > 0) {
          // Behaviour guide
          const issue = issueRotation[(weekHash + d) % issueRotation.length];
          activities.push({
            id: `${d}-guide-0`,
            kind: 'guide',
            issueId: issue,
            titleKey: 'review_guide',
            estimatedMinutes: 5,
            completed: false,
          });
        } else {
          // Mental stimulation
          const ref = MENTAL_REFS[(weekHash + d) % MENTAL_REFS.length];
          activities.push({
            id: `${d}-mental-0`,
            kind: 'mental',
            mentalRef: ref,
            titleKey: `mental_${ref}`,
            estimatedMinutes: 10,
            completed: false,
          });
        }
      }
    }

    days.push({ dayIndex: d, activities });
  }

  return days;
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

/** Get the plan for `weekDate`'s ISO week. Generates + persists on first read.
 *  Pass `forceRegenerate=true` to throw away an existing plan and rebuild it. */
export async function getOrCreatePlanForWeek(opts: {
  dog: Dog;
  userId: string;
  prefs?: TrainingPrefs;
  completedCourseIds: string[];
  weekDate: Date;
  forceRegenerate?: boolean;
}): Promise<WeeklyPlan> {
  const weekIso = weekIsoLabel(opts.weekDate);
  const docId = planDocId(opts.dog.id, weekIso);
  const ref = doc(db, COLLECTION, docId);

  if (!opts.forceRegenerate) {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return { id: snap.id, ...(snap.data() as Omit<WeeklyPlan, 'id'>) };
    }
  }

  const days = generateWeekActivities(
    { dog: opts.dog, prefs: opts.prefs, completedCourseIds: opts.completedCourseIds },
    weekIso,
  );

  const plan: Omit<WeeklyPlan, 'id'> = {
    userId: opts.userId,
    dogId: opts.dog.id,
    weekIso,
    weekStart: Timestamp.fromDate(startOfIsoWeekUtc(opts.weekDate)),
    days,
    generatedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  await setDoc(ref, plan);
  return { id: docId, ...plan };
}

/** Toggle a single activity completion and persist the whole plan back.
 *  Returns the new plan with updated state. */
export async function toggleActivity(
  plan: WeeklyPlan,
  dayIndex: number,
  activityId: string,
): Promise<WeeklyPlan> {
  const days = plan.days.map((d) => {
    if (d.dayIndex !== dayIndex) return d;
    return {
      ...d,
      activities: d.activities.map((a) => {
        if (a.id !== activityId) return a;
        const willBeCompleted = !a.completed;
        return {
          ...a,
          completed: willBeCompleted,
          ...(willBeCompleted ? { completedAt: Timestamp.now() } : {}),
        };
      }),
    };
  });

  const updated: WeeklyPlan = { ...plan, days, updatedAt: Timestamp.now() };
  // Strip the doc id when writing.
  const { id, ...payload } = updated;
  await setDoc(doc(db, COLLECTION, id), payload, { merge: true });
  return updated;
}

/** Stats helper: total / completed activities in a plan. */
export function planProgress(plan: WeeklyPlan): { total: number; completed: number } {
  let total = 0;
  let completed = 0;
  for (const d of plan.days) {
    for (const a of d.activities) {
      if (a.kind === 'rest') continue;
      total++;
      if (a.completed) completed++;
    }
  }
  return { total, completed };
}

/** Most-recent plan for a dog (admin/debug helper, optional). */
export async function getLatestPlan(dogId: string): Promise<WeeklyPlan | null> {
  const q = query(
    collection(db, COLLECTION),
    where('dogId', '==', dogId),
    orderBy('weekStart', 'desc'),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...(d.data() as Omit<WeeklyPlan, 'id'>) };
}
