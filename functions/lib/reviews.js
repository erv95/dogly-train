"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.onReviewWrite = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
/**
 * Firestore trigger: recalculate trainer's average rating
 * when a review is created or updated.
 */
exports.onReviewWrite = functions.firestore
    .document("reviews/{reviewId}")
    .onWrite(async (change, context) => {
    const data = change.after.exists ? change.after.data() : null;
    if (!data)
        return; // Review deleted — skip
    const trainerId = data.toUserId;
    if (!trainerId)
        return;
    try {
        // Get all reviews for this trainer
        const reviewsSnapshot = await db
            .collection("reviews")
            .where("toUserId", "==", trainerId)
            .get();
        const totalReviews = reviewsSnapshot.size;
        let sumRatings = 0;
        reviewsSnapshot.forEach((doc) => {
            var _a;
            sumRatings += (_a = doc.data().rating) !== null && _a !== void 0 ? _a : 0;
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
    }
    catch (error) {
        functions.logger.error("Error recalculating rating", error);
    }
});
//# sourceMappingURL=reviews.js.map