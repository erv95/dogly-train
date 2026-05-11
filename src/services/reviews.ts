import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
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
 *
 * `fromUserDisplayName` / `fromUserPhotoURL` are denormalised so the public
 * review list can render without per-row user fetches. Rules cross-check that
 * the name matches the auth user's actual displayName to prevent spoofing.
 */
export async function submitReview(
  fromUserId: string,
  toUserId: string,
  rating: number,
  comment: string,
  fromUserDisplayName: string,
  fromUserPhotoURL: string | null,
): Promise<void> {
  const reviewId = getReviewId(fromUserId, toUserId);
  await setDoc(doc(db, 'reviews', reviewId), {
    fromUserId,
    toUserId,
    rating,
    comment: comment.trim(),
    createdAt: Timestamp.now(),
    fromUserDisplayName,
    fromUserPhotoURL: fromUserPhotoURL ?? null,
  });
}

/**
 * Public list of reviews for a provider (trainer or caretaker). Shown on the
 * provider's detail page so prospective clients can see real feedback.
 */
export async function getReviewsForProvider(providerId: string, maxResults = 50): Promise<Review[]> {
  const q = query(
    collection(db, 'reviews'),
    where('toUserId', '==', providerId),
    orderBy('createdAt', 'desc'),
    limit(maxResults)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Review));
}

/** @deprecated Use `getReviewsForProvider`. Kept for backwards compatibility. */
export const getReviewsForTrainer = getReviewsForProvider;
