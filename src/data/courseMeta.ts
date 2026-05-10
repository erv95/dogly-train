// ── Course structural metadata ───────────────────────────────────────────────
//
// Non-textual properties of each course (IDs, booleans, numeric thresholds).
// Text content (titles, descriptions, steps, methods, etc.) lives in the
// locale JSON files under `owner.coursesPage.<id>.*` so it can be translated.
//
// Keep this file in sync with COURSE_DIFFICULTIES in src/services/dogStats.ts
// and the COURSES array assembled in app/(shared)/courses.tsx.

export interface CourseMeta {
  id: string;
  emoji: string;
  difficulty: 'very_basic' | 'basic' | 'intermediate' | 'advanced' | 'expert';
  /** Minimum recommended age in months. */
  minAgeMonths: number;
  /** Course IDs that should ideally be completed first. Empty = no prereqs. */
  prerequisites: string[];
  /** Course IDs to suggest at the end of this one. */
  relatedCourses: string[];
  /** Whether the course strictly avoids any aversive technique. */
  positiveOnly: boolean;
  /** Number of distinct training methods documented for this course. UI uses
   *  this to decide whether to render the method selector. */
  methodCount: 1 | 2 | 3;
}

export const COURSE_META: Record<string, CourseMeta> = {
  sit: {
    id: 'sit',
    emoji: '🐶',
    difficulty: 'very_basic',
    minAgeMonths: 2,
    prerequisites: [],
    relatedCourses: ['lie', 'stay', 'paw'],
    positiveOnly: true,
    methodCount: 2,
  },
  // The remaining 9 existing courses keep their legacy text format until the
  // pilot is approved. Only `sit` is migrated to the rich structure for now.
  lie:         { id: 'lie',         emoji: '🐕',  difficulty: 'very_basic',  minAgeMonths: 2,  prerequisites: ['sit'],         relatedCourses: ['stay', 'place'],         positiveOnly: true, methodCount: 1 },
  name:        { id: 'name',        emoji: '🐶',  difficulty: 'very_basic',  minAgeMonths: 2,  prerequisites: [],              relatedCourses: ['come', 'sit'],           positiveOnly: true, methodCount: 1 },
  come:        { id: 'come',        emoji: '🏃',  difficulty: 'basic',       minAgeMonths: 3,  prerequisites: ['name'],        relatedCourses: ['stay', 'distraction'],   positiveOnly: true, methodCount: 1 },
  stay:        { id: 'stay',        emoji: '✋',  difficulty: 'basic',       minAgeMonths: 3,  prerequisites: ['sit', 'lie'],  relatedCourses: ['place', 'distraction'],  positiveOnly: true, methodCount: 1 },
  leash:       { id: 'leash',       emoji: '🦮',  difficulty: 'basic',       minAgeMonths: 3,  prerequisites: ['name'],        relatedCourses: ['distraction'],           positiveOnly: true, methodCount: 1 },
  paw:         { id: 'paw',         emoji: '🤝',  difficulty: 'intermediate',minAgeMonths: 3,  prerequisites: ['sit'],         relatedCourses: ['lie'],                   positiveOnly: true, methodCount: 1 },
  place:       { id: 'place',       emoji: '🛏️',  difficulty: 'intermediate',minAgeMonths: 4,  prerequisites: ['lie', 'stay'], relatedCourses: ['stay', 'distraction'],   positiveOnly: true, methodCount: 1 },
  distraction: { id: 'distraction', emoji: '🎯', difficulty: 'advanced',    minAgeMonths: 6,  prerequisites: ['stay', 'come'],relatedCourses: ['drop'],                  positiveOnly: true, methodCount: 1 },
  drop:        { id: 'drop',        emoji: '🦴', difficulty: 'advanced',    minAgeMonths: 6,  prerequisites: ['leash'],       relatedCourses: ['distraction'],           positiveOnly: true, methodCount: 1 },

  // ── 10 new courses (added in v2 expansion) ───────────────────────────────────
  leave_it:    { id: 'leave_it',    emoji: '🚫',  difficulty: 'basic',        minAgeMonths: 3,  prerequisites: [],              relatedCourses: ['drop', 'wait'],          positiveOnly: true, methodCount: 2 },
  fetch:       { id: 'fetch',       emoji: '🎾',  difficulty: 'basic',        minAgeMonths: 3,  prerequisites: ['name'],        relatedCourses: ['drop'],                  positiveOnly: true, methodCount: 2 },
  wait:        { id: 'wait',        emoji: '⏸️',  difficulty: 'basic',        minAgeMonths: 3,  prerequisites: ['sit'],         relatedCourses: ['stay', 'leave_it'],      positiveOnly: true, methodCount: 1 },
  settle:      { id: 'settle',      emoji: '😌',  difficulty: 'intermediate', minAgeMonths: 4,  prerequisites: ['lie'],         relatedCourses: ['place'],                 positiveOnly: true, methodCount: 1 },
  heel:        { id: 'heel',        emoji: '👣',  difficulty: 'intermediate', minAgeMonths: 4,  prerequisites: ['leash'],       relatedCourses: ['distraction'],           positiveOnly: true, methodCount: 2 },
  shake:       { id: 'shake',       emoji: '👋',  difficulty: 'intermediate', minAgeMonths: 4,  prerequisites: ['paw'],         relatedCourses: ['paw', 'high_five'],      positiveOnly: true, methodCount: 1 },
  spin:        { id: 'spin',        emoji: '🌀',  difficulty: 'intermediate', minAgeMonths: 4,  prerequisites: ['name'],        relatedCourses: ['bow'],                   positiveOnly: true, methodCount: 1 },
  high_five:   { id: 'high_five',   emoji: '🖐️',  difficulty: 'intermediate', minAgeMonths: 4,  prerequisites: ['paw'],         relatedCourses: ['shake'],                 positiveOnly: true, methodCount: 1 },
  roll_over:   { id: 'roll_over',   emoji: '🔄',  difficulty: 'advanced',     minAgeMonths: 6,  prerequisites: ['lie'],         relatedCourses: ['bow'],                   positiveOnly: true, methodCount: 1 },
  bow:         { id: 'bow',         emoji: '🙇',  difficulty: 'intermediate', minAgeMonths: 5,  prerequisites: ['lie'],         relatedCourses: ['spin', 'roll_over'],     positiveOnly: true, methodCount: 1 },
};

export const ALL_COURSE_IDS = Object.keys(COURSE_META);

export function getCourseMeta(id: string): CourseMeta | undefined {
  return COURSE_META[id];
}
