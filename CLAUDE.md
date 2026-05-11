# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Dogly Train

Mobile marketplace connecting dog owners with **trainers** and **caretakers**, plus a full owner-side toolkit (training, walks, health, courses, breed AI). Built with Expo (React Native) + Firebase (Blaze plan).

## Tech Stack

- **Frontend:** Expo SDK 54, React Native 0.81, Expo Router 6, TypeScript 5.9
- **Backend:** Firebase Auth, Firestore, Cloud Functions (Node 22), Storage, Hosting
- **Payments:** Stripe Checkout + PayPal (redirect → webhook → server credits coins). Off-platform Bizum for booking payments.
- **Auth:** Firebase Auth (email/password). Email verification gate for referral bonus.
- **i18n:** 5 languages (ES, EN, FR, PT, DE) via i18next + react-i18next
- **Persistence:** AsyncStorage for language + first-launch + onboarding flags
- **Key Libraries:** `@tanstack/react-query`, `geofire-common`, `rn-emoji-keyboard`, `react-native-maps`, `expo-haptics`, `expo-image-manipulator`, `expo-notifications`, `expo-location`, `expo-image-picker`, `expo-clipboard`

## Common Commands

```bash
# Frontend
npm install
npx expo start                    # Dev server
npx expo start --clear            # Clear Metro cache (REQUIRED after locale/asset changes)
npx expo run:android
npx expo run:ios

# Cloud Functions
cd functions && npm run build     # Compile TypeScript
cd functions && npm run deploy    # Build + deploy ALL functions
cd functions && npm run serve     # Build + local emulator

# Selective function deploy (faster)
firebase deploy --only functions:<funcA>,functions:<funcB>

# Firebase rules + indexes (deploy in this order after schema changes)
firebase deploy --only firestore:indexes
firebase deploy --only firestore:rules
firebase deploy --only storage

# Type check
npx tsc --noEmit
cd functions && npx tsc --noEmit
```

## Architecture

### Route Groups (Expo Router) — 5 groups, ~61 screens

- `(auth)/` — language-select, onboarding, welcome, login, register, complete-profile
- `(owner)/` — home (search), dogs, chats, courses, bookings, profile
- `(trainer)/` — dashboard, chats, coins, my-profile, bookings
- `(caretaker)/` — dashboard, chats, coins, my-profile, bookings
- `(shared)/` — accessible to all roles: chat/[id], trainer/[id], caretaker/[id], dog-form, purchase, settings, admin, transactions, courses, review/[trainerId], referrals, availability, book/[providerId], bookings/[id], live-session/[bookingId], dog-health/[dogId], training-prefs/[dogId], weekly-plan/[dogId], breed-identifier/[dogId], walk-tracker/[dogId], walk/[walkId], challenges/[challengeId], behavior-guides/[issueId], emergency, emergency-protocol/[id], places/[id], place-form, identity-verification, clicker

Entry point `app/index.tsx` is the central router gate. It checks AsyncStorage flags in this order:
1. `@dogly_lang_selected` → first run? → `/(auth)/language-select`
2. `@dogly_onboarded` → unauth user without onboarding? → `/(auth)/onboarding`
3. `firebaseUser` + `userData` → route to role's home (owner/trainer/caretaker)

**IMPORTANT**: any screen that completes a "setup" step must `router.replace('/')` (NOT directly to welcome) so the index gate runs the next check. See `language-select.tsx` and `onboarding.tsx`.

### Cloud Functions (`functions/src/` — 15 files, ~3,500 lines, 32 exported functions)

All financial / sensitive / cross-user operations run server-side. Common patterns extracted in `_shared.ts`: `setupCors`, `verifyCallerToken`, `enforceRateLimit`, `idempotentTransition`, `notifyByPush`.

- `payments.ts` — Stripe Checkout + webhook (idempotent inside transaction)
- `paypal.ts` — PayPal order + webhook (signature verification, idempotent)
- `premium.ts` — One-time premium purchase (Stripe + PayPal flows)
- `coins.ts` — Boost activation (atomic deduction)
- `admin.ts` — Boost expiration cron (hourly), GDPR account deletion, adminGrantCoins
- `notifications.ts` — Push via Expo Push API, welcome message on signup, admin broadcast (5-min cooldown), `push_log` for delivery dashboard
- `reviews.ts` — onWrite trigger recalculates trainer/caretaker `averageRating` + `totalReviews`
- `breed.ts` — AI breed identification via Claude Vision (10-coin spend, idempotent log)
- `users.ts` — `onUserUpdate` trigger denormalises displayName/photoURL/bizumPhone to chats + active bookings; `adminSyncUserDenormalized` admin tool to backfill legacy data
- `bookings.ts` — `createBooking` (atomic slot lock + denormalisation), `cancelBooking`, `markBookingCompleted` (with referral claim hook), `onBookingCreate`, `autoCompleteScheduled` (semantically auto-EXPIRE: 2h after serviceEndAt → status=expired + release holds + push to both parties), `sendBookingReminders`, `getProviderOccupiedSlots` (server-side lookup so non-participants can see busy slots without exposing booking data)
- `recurringBookings.ts` — `previewRecurringSeries` (analyse without writing), `createRecurringBookings` (single-tx, supports `skipUnavailable`), `cancelRecurringSeries`. DST-safe via Madrid local-time anchoring.
- `liveSessions.ts` — `startLiveSession`, `endLiveSession`, `pruneStaleLiveSessions` (cron 30 min)
- `referrals.ts` — `recordReferralSignup` (HTTP), `adminReviewReferral`, internal `recordReferralOnSignup` + `maybeClaimReferralOnFirstBookingComplete`. Anti-fraud: hash IP + cap 50 + admin queue at 3+ signups/24h same IP.

### IAM gotcha (Cloud Functions 1st gen)

When you redeploy a function, Google occasionally strips the `allUsers` invoker permission, causing 401 from the gateway BEFORE your code runs. Symptom: client sees `status: 401` with HTML body "401 Unauthorized". Fix: GCP Console → Functions → select function → PERMISSIONS → ADD PRINCIPAL: `allUsers` with role `Cloud Functions Invoker`. This is the **expected** setup for any function called by the mobile app — auth is enforced inside the function via `verifyIdToken`.

### Security Model

- **Coins/payments**: never trust client. Webhook verifies → server credits inside Firestore transaction.
- **Admin**: Custom Claims only (`token.admin === true`), refreshed via AppState listener on foreground.
- **Firestore rules** (~680 lines): ownership checks, `protectedUserFields()` (coinBalance, role, status, admin, isActive, averageRating, totalReviews, boostedUntil, isPremium, verified), `coin_transactions` write-locked, slot locks + booking transitions server-only, live session sub-collections gated by parent participant check, referrals admin-only.
- **Storage rules** (~149 lines): size limits, MIME validation per path, owner-only writes. Live session photos: any authenticated user reads (URLs are unguessable), only provider writes.
- **Chat**: deterministic IDs (`[uid1, uid2].sort().join('_')`), participant-only access, media MIME validation, 1000-char message limit.
- **Reports**: create-only for users, admin-only read/update/delete.
- **Email verification**: required for referral bonus claim. AuthContext mirrors `firebaseUser.emailVerified` to Firestore on login.

### Bookings system

The whole booking flow is **race-safe via doc-id collision** on `availability_holds/{providerId}_{slotId}`. If two owners pick the same slot at the same time, the second tx sees the lock and throws `slot_taken`.

- Slot grid: **30 min**. `slotId = floor(utcEpochMillis / (30 * 60 * 1000))` (integer offset).
- Timezone: **`Europe/Madrid` fija** (Spain market). All UTC↔local conversion via `Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid' })`. DST-safe in Node 20/22.
- Idempotency: `booking_transitions/{bookingId}_{transition}` (transition ∈ create/complete/cancel/expire/reminder_1h). Cron + manual operations race safely.
- **Auto-expire** (renamed semantic of `autoCompleteScheduled`): hourly cron, 2h grace period after `serviceEndAt`, marks confirmed-but-untouched bookings as `expired`, releases slot holds, pushes notification to both parties. Bookings then appear in "Canceladas" tab.
- **Recurring bookings**: weekly cadence, max 12 occurrences for trainers (chip "+10 sem" opens chat with pre-filled message), max 4 for caretakers (no escape hatch). Preview modal shows all occurrences green/red before commit; `skipUnavailable=true` lets user create only the available ones.
- **Live tracking**: foreground-only GPS via `expo-location.watchPositionAsync`, batched flush every 30s. Provider uploads photos via `expo-image-picker` + `expo-image-manipulator` (compress to 1024px). Both parties subscribe via `onSnapshot`. Cron prunes sessions whose `lastPing` > 30 min old.

### Coin economy

- Coin packages: 20→$1.99, 50→$3.99, 100→$6.99, 200→$11.99, 500→$24.99
- Boost: 20 coins = 24h boost (trainer/caretaker priority in search ranking)
- Premium: one-time purchase (€9.95) → ad-free
- Referral bonus: 30 coins each (referrer + referred) when referred verifies email + completes 1st booking. Cap 50/lifetime. Code = `displayId` (unique 6-char alphanumeric, generated at signup).
- Always-visible balance via `<CoinBalancePill />` in role home screens (taps to /transactions).

### Key Services (`src/services/` — 34 files)

Notable ones:
- `chats.ts` — deterministic chat IDs, sendMessage/sendMediaMessage, offensive word filter, real-time subscription, unread tracking
- `dogStats.ts` — XP/level system with auto-heal (recomputes stale levels), streak tracking (UTC dates)
- `bookings.ts` — listMyBookings (segment + sort order), createBooking, cancelBooking, markBookingCompleted, getProviderOccupiedSlots (CF wrapper)
- `recurringBookings.ts` — preview/create/cancel via CF
- `liveSessions.ts` — start/end + pushLocations + uploadLivePhoto + subscribeToLiveSession
- `availability.ts` — provider weekly availability + exceptions
- `referrals.ts` — code lookup + record signup + my referrals + stats
- `trainers.ts` / `caretakers.ts` — GeoFire proximity search; ranking: boosted > rating > distance
- `coins.ts` — Stripe/PayPal checkout creation, boost activation, transaction history, premium
- `breedAi.ts` — calls breed CF
- `dogWalks.ts` — manual + GPS-tracked walks (route capped at 1000 points)
- `vetRecords.ts` / `vetRecordsExport.ts` — digital pet booklet + PDF export
- `weeklyPlans.ts` — auto-generated training plan, persistent completions
- `challenges.ts` — 30-day challenge progress
- `dailyRecommendations.ts` — what each dog should do today
- `places.ts` — dog-friendly POIs (parks, restaurants, etc.) with admin moderation
- `emergencyContacts.ts`, `idVerification.ts`, `serviceReports.ts`, `reminders.ts`, `notifications.ts`
- `users.ts`, `dogs.ts`, `auth.ts`, `reviews.ts`, `adminUsers.ts`, `adminCoins.ts`

### Components (`src/components/` — 31 components + skeletons + onboarding)

- `ChatList.tsx` — shared chat list for owner and trainer/caretaker tabs
- `BookingsListView.tsx` — segmented (Próximas/Pasadas/Canceladas) + filtros + sort contextual (upcoming ASC, past/cancelled DESC). Client-side filter hides past bookings from "Próximas" instantly.
- `BookingCard.tsx`, `BookingSlotPicker.tsx` (occupied slots in red strikethrough via `getProviderOccupiedSlots` CF), `BookingFiltersModal.tsx` (filter by dog + service)
- `RecurringPreviewModal.tsx` — green/red list of N weeks before recurring create
- `BizumPaymentBlock.tsx` — Bizum number with Copy/Call/WhatsApp/Chat actions
- `LiveMapView.tsx` — react-native-maps with polyline + marker
- `CoinBalancePill.tsx` — always-visible coin chip, taps to /transactions
- `Confetti.tsx` — self-contained particle animation (no external deps)
- `DailyTipsRail.tsx` — per-dog daily recommendations rail
- `AvailabilityWeekEditor.tsx`, `BookingStatsCard.tsx`, `BookingMonthlyChart.tsx`, `WeightChart.tsx`
- `ServiceReportCard.tsx`, `ServiceReportModal.tsx`, `UserActionsModal.tsx`
- `ClickerWhistle.tsx`, `LessonTimer.tsx`, `EmailVerificationBanner.tsx`, `AdGate.tsx`, `ErrorBoundary.tsx`
- `skeletons/` — TrainerCard, BookingCard, ChatRow, DogCard, Profile (defensive 150ms delay best practice)
- `onboarding/OnboardingSlide.tsx` — 5-slide intro with scale/bob animation (Lottie placeholders, swappable later)
- `ui/` — Button, Input, Card, Avatar, StarRating, Skeleton, SkeletonGroup, LoadingScreen (barrel via `index.ts`)

### Hooks (`src/hooks/`)

- `useHaptics.ts` — wrapper over `expo-haptics` that respects `userData.preferences.disableHaptics`. Use `tap()` / `success()` / `warning()` / `error()`.

### XP / Level System

Levels: L1 (0-99 XP), L2 (100-199), L3 (200-299), L4 (300-399), L5 (400+). XP by difficulty: very_basic=15, basic=25, intermediate=40, advanced=60, expert=100. Completing all 10 base courses ≈ 435 XP = Level 5. `getDogStats()` auto-heals stale stored levels.

## Key Design Decisions

- **Off-platform payments for bookings**: app facilitates connection, owner pays provider via Bizum/cash directly. The coin system is for boost + premium + AI breed only.
- **Madrid timezone hardcoded**: app targets Spain. No tz selector.
- **Auto-confirm bookings**: if slot is free, booking is created as `confirmed` immediately. Owner sees Bizum number after.
- **No cancellation penalties**: either party cancels freely, slot reopens.
- **Coin balance never shown by client without server backing**: read from Firestore user doc, single source of truth.
- **Ranking**: boosted trainers > highest rating > closest distance.
- **GeoHash for Firestore proximity**, trainers expose approximate zone only.
- **GDPR**: explicit consent, age 16+ at registration, full data deletion (Firestore + Storage + Auth, best-effort Storage cleanup).
- **Reviews**: private (visible only to receiver + admin), one per owner→provider pair.

## Chat Keyboard Handling (Android)

**IMPORTANT:** `KeyboardAvoidingView` is unreliable on Android (especially Xiaomi/MIUI + Expo Go). The chat screen uses a custom approach:

- **iOS:** Standard KAV with `behavior="padding"` + `keyboardVerticalOffset={headerHeight}`
- **Android:** KAV disabled (`behavior={undefined}`). An inner `<View ref>` uses:
  1. `onLayout` → `measureInWindow` (once) to get container bottom in window coords
  2. `keyboardDidShow` → `containerBottom + StatusBar.currentHeight - screenY` = exact overlap
  3. `paddingBottom: overlap` applied to the inner View
  4. `switchingToEmojiRef` prevents flicker during keyboard→emoji transition

Do NOT change this to use KAV on Android. Do NOT use `Dimensions.get('window').height` (different coordinate system than `screenY`).

## Android shadow on MIUI

`shadow.sm` / `shadow.md` from `theme/index.ts` render correctly on iOS but on **Xiaomi/MIUI** Android the shadow becomes a hard grey rectangle ignoring `borderRadius`. When applying selection states (cards, chips), prefer **colored border + tinted background** over shadows. See `language-select.tsx` for the right pattern.

## i18n Rules

- **Every UI change must be translated into all 5 languages** (ES, EN, FR, PT, DE) before modifying components.
- Locale files: `src/locales/{es,en,fr,pt,de}.json` (~5,500 lines each)
- Language selected on first launch (`app/(auth)/language-select.tsx`), stored in AsyncStorage (`@dogly_language`, `@dogly_lang_selected`).
- Onboarding flag: `@dogly_onboarded` (set when user finishes the 5-slide intro)
- Run `npx expo start --clear` after changing locale JSON files.
- Server-side notifications (system messages, push titles/bodies from Cloud Functions) are currently hardcoded in Spanish — acceptable since target market is Spain.

## Courses Module

- All course text in locale files under `owner.coursesPage.<key>`. Never hardcode course text.
- Each course has a `difficulty` key mapping to `DIFFICULTY_COLORS`.
- 10 base courses: sit, lie, name, come, stay, leash, paw, place, distraction, drop. Plus extended set: bow, fetch, heel, high_five, leave_it, roll_over, settle, shake, spin, wait.

## Theme (`src/theme/index.ts`)

- Primary: `#F5A623` (warm orange), Secondary: `#2D9CDB` (teal)
- Spacing: xs(4), sm(8), md(16), lg(24), xl(32), xxl(48)
- Font sizes: xs(12) to title(34)
- Shadows: sm/md/lg with elevation (BUT see "Android shadow on MIUI" above)
- Coin packages, boost cost, premium price all live here as constants

## Metro Config

`metro.config.js` must **extend** Expo's default `blockList`, not replace it. The project-level `functions/` folder is excluded via negative lookahead regex to avoid blocking `node_modules/firebase/functions`.

## Auth Flow

- `app/index.tsx` is the central gate (see Route Groups above)
- AuthContext uses `AppState` listener to refresh Custom Claims on foreground (catches revoked admin without re-login)
- `Promise.allSettled` in auth init so user doc failure doesn't crash the app
- Auto-heal on login (in `loadUserState`): `displayNameLower` + `status` + `displayId` (legacy accounts) + `emailVerified` (mirror from Firebase Auth)
- `signUp` calls `sendEmailVerification` automatically; verification gates the referral bonus claim

## Known TypeScript Errors (non-blocking)

- `firebase.ts`: `getReactNativePersistence` export mismatch with firebase SDK types. Safe to ignore.

## Security roadmap — external dependencies

The in-code security work (Fases A–D) covers everything we can build with what we already have: Firebase Auth, Firestore, Cloud Functions, Storage. The items below close further gaps but each one needs an **external service**, a **business decision**, or a **platform/config change** that can't ship from a code commit alone. Document them here as we make calls on each.

### 1. Phone number verification

- **Why**: today email is the only proof of contact. SMS verification raises the cost of creating throwaway accounts (the #1 source of harassment + fraud on marketplaces).
- **Options**: Firebase Phone Auth (free up to 10K/month) or Twilio Verify (~$0.05/verification).
- **Decision needed**: do we *gate registration* on it (high friction, lowest fraud) or make it *optional, with a trust badge* (low friction, moderate fraud).
- **Touch points**: `src/services/auth.ts` (linkWithCredential after signup), `User.phoneVerified` flag in the user doc, badge in profile cards next to `verified`.

### 2. Two-factor auth (TOTP / authenticator apps)

- **Why**: defends against credential stuffing once we have meaningful accounts (providers with bookings, owners with payment info on file).
- **Blocker**: Firebase Auth MFA requires upgrading to the **Identity Platform** SKU (paid). Not available on the free Spark plan.
- **Decision needed**: when is the user base large enough to justify the SKU upgrade.
- **Touch points**: enrollment flow in settings → `multiFactor.getSession()` → enroll TOTP, MFA challenge during login, re-auth screen needs to handle the MFA step too.

### 3. Background checks (provider screening)

- **Why**: identity verification proves *who* but not *whether they have a criminal record*. Rover/Wag run pro-level providers through Checkr.
- **Options for Spain market**: ID-Pal (~€8/check, EU-focused), Onfido (~€10/check), Veriff (~€2/check).
- **Decision needed**: gate "Pro" status on a passed check; absorb cost or pass to provider (typical: provider pays one-time fee to upgrade).
- **Touch points**: extend `id_verifications` collection with `backgroundCheckStatus` + `vendorRef`, CF webhook to receive vendor results, admin sees both in one view, search ranks providers with both checks higher.

### 4. Liability insurance

- **Why**: every booking is a potential injury claim (dog bites, lost dog, property damage). Rover bundles $1M of insurance into every reservation; we don't have any. This is a moat as much as a safety net.
- **Options**: partner with a broker (Hiscox, Liberty Specialty Markets) offering "marketplace pooled coverage" — they charge per booking, we pass cost to the buyer.
- **Decision needed**: legal (Spanish insurance regulator authorisation), pricing model (per-booking surcharge vs. eaten by us), claim flow.
- **Touch points**: post-launch — needs lawyer + broker before any code.

### 5. Suspicious login / impossible-travel detection

- **Why**: detect "logged in from Spain at 10:00 and from Russia at 10:05" — classic account takeover signal.
- **Options**:
  - **Cheapest**: write our own — log every successful auth with IP + UA in `security_events` (we already do for some events). On each login, fetch the previous one; if geo distance / time delta is "impossible", flag the account and force re-auth.
  - **Hosted**: Firebase Auth's built-in *Identity Risk Detection* (Identity Platform feature, same SKU upgrade as MFA).
- **Decision needed**: ship the custom solution now (a few hours of code, no extra cost) or wait until the MFA upgrade and use the hosted one.

### 6. Firebase Trigger Email extension

- **Why**: B.4 wired `sendSecurityEmail` to write rows into the `mail/` collection following the Trigger Email schema, but the actual SMTP send only happens if the extension is **installed in the Firebase console**.
- **Status**: code is ready, extension is not installed.
- **Action**: install via Firebase console → Extensions → "Trigger Email" → configure SMTP (Brevo, SendGrid, or Gmail SMTP for testing). Until then `mail/` docs serve as an audit trail only.

### 7. App Store / Play Store data-safety declarations

- **Why**: both stores require declaring every data category we collect. Inaccurate disclosure → app removal.
- **Touch points outside code**: App Store Connect → Privacy details; Play Console → Data safety form. Re-do on every major data-collection change (e.g., when we add phone verification we need to add "Phone number" to the declared list).

### 8. Production SMTP for email verification

- **Status today**: `sendEmailVerification` works via Firebase's default SMTP (limited deliverability, generic "Firebase" sender).
- **Action**: in Firebase console → Authentication → Templates, override sender + reply-to with our domain and configure SPF/DKIM. Improves deliverability and brand trust.

### 9. Stricter `firestore.rules` simulation tests

- **Why**: rules are 680+ lines, and a single typo can leak a collection publicly.
- **Action**: write `@firebase/rules-unit-testing` test suite covering at least: reviews public read, disputes both-party read, security_events admin-only, mail/ admin-only. Run on CI. We don't have CI yet either.

### 10. Logging + alerting on `security_events`

- **Why**: `dispute_opened`, `revoke_all_sessions`, `data_export`, `account_deletion_requested` all land in `security_events` but nobody is watching the collection.
- **Action**: either a daily digest function (sums by type, emails admin) or wire Pub/Sub → Cloud Logging → an alerting policy when the rate of `revoke_all_sessions` doubles week-over-week.

Each of these is its own ticket. Bundle them as needed; don't gate the launch on any single one beyond what the privacy policy promises.

## Deploy Workflow

1. **Indexes first** (always): `firebase deploy --only firestore:indexes`. Wait for "Enabled" in console (build can take 5-30 min).
2. **Rules**: `firebase deploy --only firestore:rules` and `firebase deploy --only storage`
3. **Functions**: `cd functions && npm run build && firebase deploy --only functions:<name1>,functions:<name2>`
4. **App**: `eas build` (Android + iOS)
5. **Smoke test in staging**

If a function returns 401 immediately after deploy, check IAM (see "IAM gotcha" above).

## File Inventory

| Area | Files | Approx lines |
|------|-------|-------|
| Route screens (`app/`) | ~61 | ~17,000 |
| Services (`src/services/`) | 34 | ~4,500 |
| Components (`src/components/`) | 31 + skeletons + onboarding | ~6,000 |
| Hooks (`src/hooks/`) | 1 | ~50 |
| Theme + Types + Config | ~6 | ~700 |
| Locale files | 5 | ~28,000 |
| Cloud Functions | 15 | ~3,500 |
| Rules (Firestore + Storage) | 2 | ~830 |
| **Total source** | **~155** | **~60,000** |
