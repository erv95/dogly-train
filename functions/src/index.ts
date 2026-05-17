import * as admin from "firebase-admin";

admin.initializeApp();

// Payments (Stripe)
export { createCheckoutSession, stripeWebhook } from "./payments";

// Coins & Boost
export { activateBoost } from "./coins";

// Reviews
export { onReviewWrite } from "./reviews";

// Places — incremental rating aggregate (replaces client-side transaction
// that needed a permissive rule on the parent place doc)
export { onPlaceRatingWrite } from "./places";

// Admin & GDPR
export {
  checkBoostExpiration,
  deleteUserAccount,
  restoreAccount,
  processPendingDeletions,
  adminGrantCoins,
} from "./admin";

// Push notifications + welcome + broadcast
export { onNewMessage, onUserCreate, sendBroadcastMessage } from "./notifications";

// User profile sync — denormalises displayName/photoURL/bizumPhone changes to
// chats and active bookings so peers see the updated info. The admin function
// force-replays the same propagation for legacy stale data.
export { onUserUpdate, adminSyncUserDenormalized } from "./users";

// PayPal payments
export { createPaypalOrder, paypalWebhook } from "./paypal";

// Premium (remove ads) — one-time purchase
export { createPremiumCheckoutStripe, createPremiumOrderPaypal } from "./premium";

// AI breed identification (Claude Vision)
export { identifyBreed } from "./breed";

// Bookings (calendar + reservations, off-platform payment)
export {
  createBooking,
  onBookingCreate,
  cancelBooking,
  markBookingCompleted,
  autoCompleteScheduled,
  sendBookingReminders,
  getProviderOccupiedSlots,
} from "./bookings";

// Referrals (coin-based growth loop, anti-fraud audit)
export { recordReferralSignup, adminReviewReferral } from "./referrals";

// Live tracking (provider broadcasts location + photos during a booking)
export { startLiveSession, endLiveSession, pruneStaleLiveSessions } from "./liveSessions";

// Recurring bookings (weekly series, single-tx atomic creation)
export { createRecurringBookings, cancelRecurringSeries, previewRecurringSeries } from "./recurringBookings";

// Security (sensitive account actions: revoke sessions, soft-delete, etc.)
export { revokeAllSessions } from "./security";

// GDPR data export (Article 20 — right to data portability)
export { exportUserData } from "./dataExport";

// Dispute resolution (booking-scoped, admin-moderated)
export { openDispute, adminResolveDispute } from "./disputes";
