// ── 30-day challenge templates ────────────────────────────────────────────────
//
// Static structural data for each challenge: which course (if any) each day
// links to, how many minutes the activity takes, how much XP it rewards.
//
// All textual content (title + instruction per day) lives in the locale files
// under `challenges.{templateId}.days.{day}.{title|instruction}`. The template
// metadata (catalog name + intro) is under `challenges.{templateId}.{name|description}`.

import { ChallengeId, ChallengeTemplate } from '../types';

/** Helper: build a 30-day array, with optional per-day overrides. */
function buildDays(
  base: { estimatedMinutes: number; xpReward: number; courseId?: string },
  overrides: Record<number, Partial<{ courseId: string; estimatedMinutes: number; xpReward: number }>> = {},
): ChallengeTemplate['days'] {
  const out: ChallengeTemplate['days'] = [];
  for (let d = 1; d <= 30; d++) {
    const o = overrides[d] ?? {};
    out.push({
      day: d,
      estimatedMinutes: o.estimatedMinutes ?? base.estimatedMinutes,
      xpReward: o.xpReward ?? base.xpReward,
      ...(o.courseId ?? base.courseId ? { courseId: o.courseId ?? base.courseId } : {}),
    });
  }
  return out;
}

/** Obediencia básica (30 días) — rotates through the 8 core obedience courses. */
const OBEDIENCE_30: ChallengeTemplate = {
  id: 'obedience_basic_30',
  difficulty: 'beginner',
  days: buildDays(
    { estimatedMinutes: 5, xpReward: 5 },
    {
      // Each day links to the most relevant course
      1: { courseId: 'sit' },
      2: { courseId: 'name' },
      3: { courseId: 'sit' },
      4: { courseId: 'lie' },
      5: { courseId: 'come' },
      6: { courseId: 'wait' },
      7: { courseId: 'sit', xpReward: 10 },     // week-1 review bonus
      8: { courseId: 'lie' },
      9: { courseId: 'name' },
      10: { courseId: 'stay' },
      11: { courseId: 'come' },
      12: { courseId: 'place' },
      13: { courseId: 'wait' },
      14: { courseId: 'stay', xpReward: 10 },   // week-2 review bonus
      15: { courseId: 'heel' },
      16: { courseId: 'sit' },
      17: { courseId: 'lie' },
      18: { courseId: 'come' },
      19: { courseId: 'stay' },
      20: { courseId: 'place' },
      21: { courseId: 'heel', xpReward: 10 },   // week-3 review bonus
      22: { courseId: 'wait' },
      23: { courseId: 'name' },
      24: { courseId: 'come' },
      25: { courseId: 'stay' },
      26: { courseId: 'place' },
      27: { courseId: 'heel' },
      28: { courseId: 'sit', estimatedMinutes: 8 },
      29: { courseId: 'come', estimatedMinutes: 8 },
      30: { xpReward: 30, estimatedMinutes: 10 }, // final challenge — no specific course
    }
  ),
};

/** Socialización (30 días) — short controlled exposure activities. No course
 *  link; instructions in locale describe each day's micro-mission. */
const SOCIALIZATION_30: ChallengeTemplate = {
  id: 'socialization_30',
  difficulty: 'intermediate',
  days: buildDays(
    { estimatedMinutes: 10, xpReward: 6 },
    {
      7: { xpReward: 10 },
      14: { xpReward: 10 },
      21: { xpReward: 10 },
      30: { xpReward: 30, estimatedMinutes: 15 },
    }
  ),
};

/** Trucos divertidos (30 días) — rotates fun trick courses. */
const FUN_TRICKS_30: ChallengeTemplate = {
  id: 'fun_tricks_30',
  difficulty: 'intermediate',
  days: buildDays(
    { estimatedMinutes: 5, xpReward: 6 },
    {
      1: { courseId: 'paw' },
      2: { courseId: 'paw' },
      3: { courseId: 'shake' },
      4: { courseId: 'shake' },
      5: { courseId: 'high_five' },
      6: { courseId: 'high_five' },
      7: { courseId: 'paw', xpReward: 10 },
      8: { courseId: 'spin' },
      9: { courseId: 'spin' },
      10: { courseId: 'bow' },
      11: { courseId: 'bow' },
      12: { courseId: 'roll_over' },
      13: { courseId: 'roll_over' },
      14: { courseId: 'spin', xpReward: 10 },
      15: { courseId: 'fetch' },
      16: { courseId: 'fetch' },
      17: { courseId: 'high_five' },
      18: { courseId: 'paw' },
      19: { courseId: 'shake' },
      20: { courseId: 'spin' },
      21: { courseId: 'fetch', xpReward: 10 },
      22: { courseId: 'bow' },
      23: { courseId: 'roll_over' },
      24: { courseId: 'high_five' },
      25: { courseId: 'paw' },
      26: { courseId: 'spin' },
      27: { courseId: 'fetch' },
      28: { courseId: 'roll_over', estimatedMinutes: 8 },
      29: { courseId: 'fetch', estimatedMinutes: 8 },
      30: { xpReward: 30, estimatedMinutes: 10 }, // trick chain
    }
  ),
};

/** Mente activa (30 días) — mental stimulation games & enrichment. No course link. */
const MENTAL_ACTIVE_30: ChallengeTemplate = {
  id: 'mental_active_30',
  difficulty: 'beginner',
  days: buildDays(
    { estimatedMinutes: 8, xpReward: 5 },
    {
      7: { xpReward: 10 },
      14: { xpReward: 10 },
      21: { xpReward: 10 },
      30: { xpReward: 30, estimatedMinutes: 12 },
    }
  ),
};

export const CHALLENGE_TEMPLATES: Record<ChallengeId, ChallengeTemplate> = {
  obedience_basic_30: OBEDIENCE_30,
  socialization_30:   SOCIALIZATION_30,
  fun_tricks_30:      FUN_TRICKS_30,
  mental_active_30:   MENTAL_ACTIVE_30,
};

/** Order in which challenges are displayed in the catalog. */
export const CHALLENGE_CATALOG_ORDER: ChallengeId[] = [
  'obedience_basic_30',
  'socialization_30',
  'fun_tricks_30',
  'mental_active_30',
];

/** Visual color per challenge — used in cards and headers. Keep in sync with
 *  the catalog order. */
export const CHALLENGE_COLORS: Record<ChallengeId, string> = {
  obedience_basic_30: '#F5A623',  // primary
  socialization_30:   '#2D9CDB',  // secondary teal
  fun_tricks_30:      '#9B51E0',  // purple
  mental_active_30:   '#27AE60',  // green
};

export const CHALLENGE_ICONS: Record<ChallengeId, string> = {
  obedience_basic_30: 'school-outline',
  socialization_30:   'people-outline',
  fun_tricks_30:      'sparkles-outline',
  mental_active_30:   'bulb-outline',
};
