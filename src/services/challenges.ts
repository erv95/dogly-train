import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  Timestamp,
  deleteField,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { ChallengeId, ChallengeProgress } from '../types';
import { CHALLENGE_TEMPLATES } from '../data/challengeTemplates';

const COLLECTION = 'challenge_progress';

export function progressDocId(dogId: string, templateId: ChallengeId): string {
  return `${dogId}_${templateId}`;
}

/** Returns the persisted progress for a (dog, challenge) pair, or null if the
 *  user hasn't started this challenge yet. Use `startChallenge` to create. */
export async function getChallengeProgress(
  dogId: string,
  templateId: ChallengeId,
): Promise<ChallengeProgress | null> {
  const ref = doc(db, COLLECTION, progressDocId(dogId, templateId));
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<ChallengeProgress, 'id'>) };
}

/** Returns all challenge progress docs for a given dog. Used in the catalog
 *  page to badge each template with "Started" / progress. */
export async function getAllProgressForDog(
  dogId: string,
  userId: string,
): Promise<ChallengeProgress[]> {
  const q = query(
    collection(db, COLLECTION),
    where('userId', '==', userId),
    where('dogId', '==', dogId),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChallengeProgress, 'id'>) }));
}

/** Create a fresh progress doc on first start. Idempotent — if a doc already
 *  exists it's returned unchanged. */
export async function startChallenge(opts: {
  userId: string;
  dogId: string;
  templateId: ChallengeId;
}): Promise<ChallengeProgress> {
  const id = progressDocId(opts.dogId, opts.templateId);
  const ref = doc(db, COLLECTION, id);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    return { id: existing.id, ...(existing.data() as Omit<ChallengeProgress, 'id'>) };
  }
  const data: Omit<ChallengeProgress, 'id'> = {
    userId: opts.userId,
    dogId: opts.dogId,
    templateId: opts.templateId,
    startedAt: Timestamp.now(),
    completions: [],
    completed: false,
    updatedAt: Timestamp.now(),
  };
  await setDoc(ref, data);
  return { id, ...data };
}

/** Mark a single day as complete. If already complete, no-op. Updates the
 *  `completed` + `completedAt` flags when the 30th day is checked. Returns the
 *  updated progress + how much XP the user just earned (0 if no-op). */
export async function markDayComplete(
  progress: ChallengeProgress,
  day: number,
): Promise<{ progress: ChallengeProgress; xpEarned: number }> {
  if (day < 1 || day > 30) throw new Error('Day must be 1..30');

  const template = CHALLENGE_TEMPLATES[progress.templateId];
  const dayMeta = template?.days.find((d) => d.day === day);
  if (!dayMeta) throw new Error('Unknown day for this challenge');

  // Already done?
  if (progress.completions.some((c) => c.day === day)) {
    return { progress, xpEarned: 0 };
  }

  const completions = [...progress.completions, { day, completedAt: Timestamp.now() }]
    .sort((a, b) => a.day - b.day);
  const allDone = completions.length >= 30;

  const updated: ChallengeProgress = {
    ...progress,
    completions,
    completed: allDone,
    ...(allDone && !progress.completedAt ? { completedAt: Timestamp.now() } : {}),
    updatedAt: Timestamp.now(),
  };

  const { id, ...payload } = updated;
  await setDoc(doc(db, COLLECTION, id), payload, { merge: true });
  return { progress: updated, xpEarned: dayMeta.xpReward };
}

/** Unmark a previously-completed day (in case the user tapped by mistake). */
export async function unmarkDayComplete(
  progress: ChallengeProgress,
  day: number,
): Promise<ChallengeProgress> {
  const completions = progress.completions.filter((c) => c.day !== day);
  // Build the local return value (with completedAt stripped) and the Firestore
  // payload separately, since Firestore rejects `undefined` and needs a
  // sentinel `deleteField()` to actually drop a stored field.
  const { completedAt: _previousCompletedAt, ...progressBase } = progress;
  const updated: ChallengeProgress = {
    ...progressBase,
    completions,
    completed: false,
    updatedAt: Timestamp.now(),
  };
  const { id, ...rest } = updated;
  const payload: Record<string, unknown> = { ...rest };
  // Only request the field deletion if the doc actually had it set; otherwise
  // skip to avoid an unnecessary write.
  if (_previousCompletedAt) {
    payload.completedAt = deleteField();
  }
  await setDoc(doc(db, COLLECTION, id), payload, { merge: true });
  return updated;
}

// ── Pure helpers ────────────────────────────────────────────────────────────

/** The current day number a user "should" be on: highest completed day + 1,
 *  capped at 30. */
export function currentDayOf(progress: ChallengeProgress | null): number {
  if (!progress) return 1;
  const maxDone = progress.completions.reduce((m, c) => Math.max(m, c.day), 0);
  return Math.min(30, maxDone + 1);
}

export function isDayDone(progress: ChallengeProgress | null, day: number): boolean {
  if (!progress) return false;
  return progress.completions.some((c) => c.day === day);
}
