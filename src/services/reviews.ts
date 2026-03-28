import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Review } from '../types';

/**
 * Get review ID (one review per owner-trainer pair)
 */
function getReviewId(fromUserId: string, toUserId: string): string {
  return `${fromUserId}_${toUserId}`;
}

/**
 * Check if a review already exists
 */
export async function hasReviewed(fromUserId: string, toUserId: string): Promise<boolean> {
  const reviewId = getReviewId(fromUserId, toUserId);
  const docSnap = await getDoc(doc(db, 'reviews', reviewId));
  return docSnap.exists();
}

/**
 * Submit or update a review.
 * Uses a deterministic ID so one owner can only review one trainer once.
 * Rating recalculation is handled server-side (Cloud Function).
 */
export async function submitReview(
  fromUserId: string,
  toUserId: string,
  rating: number,
  comment: string
): Promise<void> {
  const reviewId = getReviewId(fromUserId, toUserId);
  await setDoc(doc(db, 'reviews', reviewId), {
    fromUserId,
    toUserId,
    rating,
    comment: comment.trim(),
    createdAt: Timestamp.now(),
  });
}

/**
 * Get all reviews for a trainer (private — only visible to the trainer)
 */
export async function getReviewsForTrainer(trainerId: string): Promise<Review[]> {
  const q = query(
    collection(db, 'reviews'),
    where('toUserId', '==', trainerId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Review));
}
