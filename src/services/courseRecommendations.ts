import { TrainingPrefs, TrainingGoal, DogTrainingLevel } from '../types';

/**
 * Map course difficulty (declared statically per course) to the trainee level
 * a user can self-report. This is what powers the "right level for your dog"
 * scoring rule.
 */
const DIFFICULTY_TO_LEVEL: Record<string, DogTrainingLevel> = {
  very_basic: 'beginner',
  basic: 'basic',
  intermediate: 'intermediate',
  advanced: 'advanced',
  expert: 'advanced',
};

/**
 * Which course IDs typically advance each goal. Used for goal-match scoring.
 * Updated for the 20 built-in courses. When adding new courses, extend these.
 */
const GOAL_TO_COURSE_IDS: Record<TrainingGoal, string[]> = {
  basic_obedience: ['sit', 'lie', 'stay', 'come', 'name', 'wait', 'heel', 'place'],
  tricks: ['paw', 'shake', 'spin', 'high_five', 'roll_over', 'bow', 'fetch'],
  behavior: ['leash', 'distraction', 'drop', 'leave_it', 'settle', 'wait'],
  socialization: ['leash', 'distraction', 'come', 'name', 'heel', 'settle'],
};

/**
 * Acceptable duration ranges (minutes) per time-availability bucket.
 * Used to soft-prefer courses that fit the user's daily window.
 */
const TIME_RANGES: Record<TrainingPrefs['timeAvailable'], [number, number]> = {
  short: [0, 7],
  medium: [5, 15],
  long: [10, 60],
};

export interface ScoreableCourse {
  id: string;
  difficulty: string;
  duration: string;  // localized e.g. "5 min" — we extract the number
}

/**
 * Compute a recommendation score for a course given the dog's training prefs
 * and the IDs of courses the dog has already completed. Higher = more relevant.
 *
 * Pure function (no side effects, no I/O) — safe to call inside useMemo.
 */
export function scoreCourse(
  course: ScoreableCourse,
  prefs: TrainingPrefs,
  completedCourseIds: string[]
): number {
  let score = 0;

  // 1. Difficulty matches user-reported level (+50)
  if (DIFFICULTY_TO_LEVEL[course.difficulty] === prefs.currentLevel) {
    score += 50;
  }
  // Adjacent difficulty also OK (+15) — don't overpenalize edge cases
  const levelOrder: DogTrainingLevel[] = ['beginner', 'basic', 'intermediate', 'advanced'];
  const courseLevelIdx = levelOrder.indexOf(DIFFICULTY_TO_LEVEL[course.difficulty]);
  const prefLevelIdx = levelOrder.indexOf(prefs.currentLevel);
  if (courseLevelIdx >= 0 && prefLevelIdx >= 0 && Math.abs(courseLevelIdx - prefLevelIdx) === 1) {
    score += 15;
  }

  // 2. Goal match (+30)
  if (GOAL_TO_COURSE_IDS[prefs.primaryGoal].includes(course.id)) {
    score += 30;
  }

  // 3. Duration fits time-availability bucket (+20)
  const minutes = parseInt(course.duration.match(/\d+/)?.[0] ?? '5', 10);
  const [tMin, tMax] = TIME_RANGES[prefs.timeAvailable];
  if (minutes >= tMin && minutes <= tMax) {
    score += 20;
  }

  // 4. Age-group bonuses (puppies and seniors should start gentle)
  if (prefs.ageGroup === 'puppy' && course.difficulty === 'very_basic') {
    score += 30;
  } else if (
    prefs.ageGroup === 'senior' &&
    (course.difficulty === 'very_basic' || course.difficulty === 'basic')
  ) {
    score += 20;
  } else if (
    prefs.ageGroup === 'adult' &&
    (course.difficulty === 'intermediate' || course.difficulty === 'advanced')
  ) {
    score += 10;
  }

  // 5. Already completed → push to bottom (don't hide — user may want to review)
  if (completedCourseIds.includes(course.id)) {
    score -= 100;
  }

  return score;
}

/**
 * Sort a list of courses by recommendation score (descending). Stable for ties.
 * Returns a NEW array (does not mutate input).
 */
export function rankCourses<T extends ScoreableCourse>(
  courses: T[],
  prefs: TrainingPrefs,
  completedCourseIds: string[]
): { course: T; score: number }[] {
  return courses
    .map((c) => ({ course: c, score: scoreCourse(c, prefs, completedCourseIds) }))
    .sort((a, b) => b.score - a.score);
}
