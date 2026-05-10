import { doc, runTransaction, Timestamp, documentId, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';

export interface CourseProgress {
  userId: string;
  dogId: string;
  courseId: string;
  completed: boolean;
  startedAt: Timestamp;
  completedAt: Timestamp | null;
}

function progressId(userId: string, dogId: string, courseId: string) {
  return `${userId}_${dogId}_${courseId}`;
}

export async function getCourseProgress(
  userId: string,
  dogId: string,
  courseIds: string[]
): Promise<Record<string, CourseProgress>> {
  if (courseIds.length === 0) return {};

  const results: Record<string, CourseProgress> = {};
  const docIds = courseIds.map((cid) => progressId(userId, dogId, cid));

  // Firestore 'in' supports max 30 values — batch if needed
  for (let i = 0; i < docIds.length; i += 30) {
    const batch = docIds.slice(i, i + 30);
    const q = query(
      collection(db, 'course_progress'),
      where(documentId(), 'in', batch)
    );
    const snap = await getDocs(q);
    snap.docs.forEach((d) => {
      const data = d.data() as CourseProgress;
      results[data.courseId] = data;
    });
  }

  return results;
}

export async function markCourseStarted(userId: string, dogId: string, courseId: string): Promise<void> {
  const ref = doc(db, 'course_progress', progressId(userId, dogId, courseId));
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) return;
    tx.set(ref, {
      userId,
      dogId,
      courseId,
      completed: false,
      startedAt: Timestamp.now(),
      completedAt: null,
    });
  });
}

export async function markCourseCompleted(userId: string, dogId: string, courseId: string): Promise<void> {
  const ref = doc(db, 'course_progress', progressId(userId, dogId, courseId));
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) {
      tx.set(ref, { completed: true, completedAt: Timestamp.now() }, { merge: true });
    } else {
      tx.set(ref, {
        userId,
        dogId,
        courseId,
        completed: true,
        startedAt: Timestamp.now(),
        completedAt: Timestamp.now(),
      });
    }
  });
}
