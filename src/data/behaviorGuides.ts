import { DogIssue } from '../types';

// ── Behavior guide catalog ────────────────────────────────────────────────────
// Static curated content. Each guide ties to a DogIssue and renders translated
// sections from the `guides.<id>.*` namespace in the locale files.
//
// 'other' is intentionally excluded — there is no specific curated content for
// generic issues; the user should consult a professional for unclassified cases.

export interface BehaviorGuideMeta {
  id: Exclude<DogIssue, 'other'>;
  emoji: string;
  color: string;
  /** Severity hint for sorting/highlighting. Higher = more urgent. */
  severity: 1 | 2 | 3;
}

export const BEHAVIOR_GUIDES: BehaviorGuideMeta[] = [
  { id: 'aggression',  emoji: '😡', color: '#EF4444', severity: 3 },
  { id: 'anxiety',     emoji: '😰', color: '#8B5CF6', severity: 2 },
  { id: 'fearful',     emoji: '🙈', color: '#3B82F6', severity: 2 },
  { id: 'destructive', emoji: '💥', color: '#EC4899', severity: 2 },
  { id: 'barking',     emoji: '🔊', color: '#F59E0B', severity: 1 },
  { id: 'pulling',     emoji: '🦮', color: '#10B981', severity: 1 },
];

export const GUIDE_SECTIONS = ['intro', 'whyHappens', 'whatToDo', 'whatNotToDo', 'exercises', 'whenToSeekHelp'] as const;
export type GuideSection = (typeof GUIDE_SECTIONS)[number];

export function getGuideById(id: string): BehaviorGuideMeta | undefined {
  return BEHAVIOR_GUIDES.find((g) => g.id === id);
}

/**
 * Sort guides so the dog's own issues appear first (matched), then the rest.
 * Within each group, order by severity descending.
 */
export function sortGuidesForDog(dogIssues: DogIssue[]): BehaviorGuideMeta[] {
  const set = new Set(dogIssues);
  return [...BEHAVIOR_GUIDES].sort((a, b) => {
    const aMatch = set.has(a.id) ? 1 : 0;
    const bMatch = set.has(b.id) ? 1 : 0;
    if (aMatch !== bMatch) return bMatch - aMatch;
    return b.severity - a.severity;
  });
}
