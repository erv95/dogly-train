import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

/**
 * Firestore trigger: recalculate trainer's average rating
 * when a review is created or updated.
 */
export const onReviewWrite = functions.firestore
  .document("reviews/{reviewId}")
  .onWrite(async (change, context) => {
    const data = change.after.exists ? change.after.data() : null;
    if (!data) return; // Review deleted — skip

    const trainerId = data.toUserId;
    if (!trainerId) return;

    try {
      // Get all reviews for this trainer
      const reviewsSnapshot = await db
        .collection("reviews")
        .where("toUserId", "==", trainerId)
        .get();

      const totalReviews = reviewsSnapshot.size;
      let sumRatings = 0;

      reviewsSnapshot.forEach((doc) => {
        sumRatings += doc.data().rating ?? 0;
      });

      const averageRating = totalReviews > 0
        ? Math.round((sumRatings / totalReviews) * 10) / 10
        : 0;

      // Update trainer profile
      await db.collection("users").doc(trainerId).update({
        averageRating,
        totalReviews,
        updatedAt: admin.firestore.Timestamp.now(),
      });

      functions.logger.info("Rating recalculated", {
        trainerId,
        averageRating,
        totalReviews,
      });
    } catch (error) {
      functions.logger.error("Error recalculating rating", error);
    }
  });
