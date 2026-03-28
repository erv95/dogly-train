import * as admin from "firebase-admin";

admin.initializeApp();

// Payments (Stripe)
export { createCheckoutSession, stripeWebhook } from "./payments";

// Coins & Boost
export { activateBoost } from "./coins";

// Reviews
export { onReviewWrite } from "./reviews";

// Admin & GDPR
export { checkBoostExpiration, deleteUserAccount } from "./admin";
