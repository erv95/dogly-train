import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

/**
 * Firestore trigger: incrementally update trainer's average rating
 * when a review is created or updated.
 * Uses atomic transaction with sumRatings/totalReviews fields
 * instead of reading ALL reviews — O(1) instead of O(n).
 */
export const onReviewWrite = functions.firestore
  .document("reviews/{reviewId}")
  .onWrite(async (change, context) => {
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;

    // Determine trainerId from whichever doc exists
    const trainerId = after?.toUserId ?? before?.toUserId;
    if (!trainerId) return;

    // Calculate delta: what changed in this write
    const oldRating = before?.rating ?? 0;
    const newRating = after?.rating ?? 0;
    const wasCreate = !change.before.exists && change.after.exists;
    const wasUpdate = change.before.exists && change.after.exists;
    const wasDelete = change.before.exists && !change.after.exists;

    let ratingDelta = 0;
    let countDelta = 0;

    if (wasCreate) {
      ratingDelta = newRating;
      countDelta = 1;
    } else if (wasUpdate) {
      ratingDelta = newRating - oldRating;
      countDelta = 0;
    } else if (wasDelete) {
      ratingDelta = -oldRating;
      countDelta = -1;
    }

    if (ratingDelta === 0 && countDelta === 0) return;

    try {
      const trainerRef = db.collection("users").doc(trainerId);

      await db.runTransaction(async (tx) => {
        const trainerDoc = await tx.get(trainerRef);
        if (!trainerDoc.exists) return;

        const data = trainerDoc.data()!;
        const currentTotal = data.totalReviews ?? 0;
        // Prefer the canonical sum field if it exists; otherwise derive from
        // the rounded average for backwards compatibility (one-time migration).
        const currentSum = typeof data.sumRatings === 'number'
          ? data.sumRatings
          : (data.averageRating ?? 0) * currentTotal;

        const newTotal = Math.max(0, currentTotal + countDelta);
        const newSum = Math.max(0, currentSum + ratingDelta);
        const newAverage = newTotal > 0
          ? Math.round((newSum / newTotal) * 10) / 10
          : 0;

        tx.update(trainerRef, {
          // Persist sumRatings so future writes don't suffer from rounding drift.
          sumRatings: newSum,
          averageRating: newAverage,
          totalReviews: newTotal,
          updatedAt: admin.firestore.Timestamp.now(),
        });
      });

      functions.logger.info("Rating updated incrementally", {
        trainerId,
        ratingDelta,
        countDelta,
      });
    } catch (error) {
      functions.logger.error("Error updating rating", error);
    }
  });
