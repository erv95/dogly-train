import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { db } from "./_shared";

/**
 * Firestore trigger: incrementally update a place's averageRating /
 * totalRatings whenever a user's rating subdoc is created, updated, or
 * deleted. Replaces the previous client-side transaction which required
 * a permissive Firestore rule that allowed any auth user to bump the
 * parent aggregates — that rule has been removed.
 *
 * Mirrors the pattern in reviews.ts: keep a canonical sumRatings field
 * so future updates don't suffer from rounding drift.
 */
export const onPlaceRatingWrite = functions.firestore
  .document("places/{placeId}/ratings/{userId}")
  .onWrite(async (change, context) => {
    const placeId = context.params.placeId as string;
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;

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
      const placeRef = db.collection("places").doc(placeId);
      await db.runTransaction(async (tx) => {
        const placeDoc = await tx.get(placeRef);
        if (!placeDoc.exists) return;

        const data = placeDoc.data()!;
        const currentTotal = data.totalRatings ?? 0;
        // Prefer the canonical sum field if it exists; otherwise derive from
        // the rounded average for backwards compatibility with legacy docs.
        const currentSum = typeof data.sumRatings === "number"
          ? data.sumRatings
          : (data.averageRating ?? 0) * currentTotal;

        const newTotal = Math.max(0, currentTotal + countDelta);
        const newSum = Math.max(0, currentSum + ratingDelta);
        const newAverage = newTotal > 0
          ? Math.round((newSum / newTotal) * 10) / 10
          : 0;

        tx.update(placeRef, {
          sumRatings: newSum,
          averageRating: newAverage,
          totalRatings: newTotal,
          updatedAt: admin.firestore.Timestamp.now(),
        });
      });

      functions.logger.info("Place rating updated", {
        placeId,
        ratingDelta,
        countDelta,
      });
    } catch (error) {
      functions.logger.error("Error updating place rating", error);
    }
  });
