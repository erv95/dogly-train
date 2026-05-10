# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Dogly Train

Mobile app connecting dog owners with professional dog trainers. Built with Expo (React Native) + Firebase (Blaze plan).

## Tech Stack

- **Frontend:** Expo SDK 54, React Native 0.81, Expo Router 6, TypeScript 5.9
- **Backend:** Firebase Auth, Firestore, Cloud Functions (Node 20), Storage
- **Payments:** Stripe Checkout + PayPal (redirect flow → webhook → server credits coins)
- **Auth:** Firebase Auth (email/password, Google, Apple, Facebook)
- **i18n:** 5 languages (ES, EN, FR, PT, DE) via i18next + react-i18next
- **Persistence:** AsyncStorage for language preference and first-launch flags
- **Key Libraries:** `@tanstack/react-query`, `geofire-common`, `rn-emoji-keyboard`, `expo-notifications`, `expo-location`, `expo-image-picker`

## Common Commands

```bash
# Frontend
npm install
npx expo start                    # Dev server
npx expo start --clear            # Clear Metro cache (required after locale/asset changes)
npx expo run:android
npx expo run:ios

# Cloud Functions
cd functions && npm run build     # Compile TypeScript
cd functions && npm run deploy    # Build + deploy functions
cd functions && npm run serve     # Build + local emulator

# Firebase rules
firebase deploy --only firestore:rules
firebase deploy --only storage

# Type check
npx tsc --noEmit
```

## Architecture

### Route Groups (Expo Router) — 21 screens

Four groups in `app/`:
- `(auth)/` — language-select, welcome, login, register (unauthenticated)
- `(owner)/` — home (trainer discovery), dogs, chats, courses, profile (dog owners)
- `(trainer)/` — dashboard, chats, coins, my-profile (trainers)
- `(shared)/` — screens accessible to both roles: chat/[id], trainer/[id], dog-form, purchase, settings, admin, courses, review/[trainerId], transactions

Entry point: `app/index.tsx` checks AsyncStorage for language, then routes by auth state. Roles: `owner` → `/(owner)/home`, `trainer` → `/(trainer)/dashboard`.

### Cloud Functions (`functions/src/` — 7 files, ~1,400 lines)

All financial and sensitive operations run server-side:
- `payments.ts` — Stripe Checkout session + webhook (idempotent, inside transaction)
- `paypal.ts` — PayPal order + webhook (signature verification via PayPal API, idempotent inside transaction, coins resolved from server-side package table)
- `coins.ts` — Boost activation (atomic deduction in Firestore transaction)
- `admin.ts` — Boost expiration scheduler (hourly), GDPR account deletion (Firestore + Storage + Auth cleanup)
- `notifications.ts` — Push via Expo Push API, welcome message on signup, admin broadcast with rate limiting (5-min cooldown, batch 50)
- `reviews.ts` — onWrite trigger recalculates trainer averageRating + totalReviews

### Security Model

- Coins/payments: never trust client. Webhook verifies → server credits inside Firestore transaction.
- Admin: Custom Claims only (`token.admin === true`), refreshed via AppState listener on foreground.
- Firestore rules (211 lines) enforce: ownership checks, protected fields (`coinBalance`, `role`, `status`, `admin`, `averageRating`, `totalReviews`, `boostedUntil`, `isActive`), `coin_transactions` write-locked to Cloud Functions.
- Storage rules (81 lines): size limits (5MB images, 10MB certs/audio/files), MIME validation per path, owner-only writes.
- Chat: deterministic IDs (`[uid1, uid2].sort().join('_')`), participant-only access, media type validation, 1000-char message limit.
- Reports: create-only for users, admin-only read/update/delete.

### Key Services (`src/services/` — 10 files, ~960 lines)

- `chats.ts` — deterministic chat IDs, `sendMessage`, `sendMediaMessage`, offensive word filtering, real-time subscription, unread tracking
- `dogStats.ts` — XP/level system with auto-heal (recomputes stale levels), streak tracking (UTC dates)
- `courseProgress.ts` — per-dog course completion, preserves `startedAt` on re-completion
- `auth.ts` — sign in/up, user profile creation with role-specific fields
- `trainers.ts` — GeoFire proximity search, ranking: boosted > rating > distance
- `coins.ts` — Stripe/PayPal checkout creation, boost activation, transaction history
- `users.ts`, `dogs.ts`, `reviews.ts`, `notifications.ts`

### Components (`src/components/`)

- `ChatList.tsx` (579 lines) — shared chat list for owner and trainer tabs
- `ui/` — Button, Input, Card, Avatar, StarRating, Skeleton, LoadingScreen (barrel exported via `index.ts`)

### XP / Level System

Levels: L1 (0-99 XP), L2 (100-199), L3 (200-299), L4 (300-399), L5 (400+). XP by difficulty: very_basic=15, basic=25, intermediate=40, advanced=60, expert=100. Completing all 10 courses ≈ 435 XP = Level 5.

`getDogStats()` auto-heals stale stored levels by recomputing from XP. Display level always derived from `computeLevel(xp)`, never from stored field.

## Key Design Decisions

- Ranking: boosted trainers > highest rating > closest distance
- Coin packages: 20→$1.99, 50→$3.99, 100→$6.99, 200→$11.99, 500→$24.99 (20 coins = 24h boost)
- Chat: text + image + file + audio. WhatsApp-style input bar with inline emoji keyboard (`rn-emoji-keyboard` EmojiKeyboard component).
- Reviews: private (visible only to receiver + admin), one per owner→trainer pair, deterministic ID `{fromUserId}_{toUserId}`
- GDPR: explicit consent, age 16+ at registration, full data deletion (Firestore + Storage + Auth, best-effort Storage cleanup)
- GeoHash for Firestore proximity queries; trainers expose approximate zone only

## Chat Keyboard Handling (Android)

**IMPORTANT:** `KeyboardAvoidingView` is unreliable on Android (especially Xiaomi/MIUI + Expo Go). The chat screen uses a custom approach:

- **iOS:** Standard KAV with `behavior="padding"` + `keyboardVerticalOffset={headerHeight}`
- **Android:** KAV disabled (`behavior={undefined}`). An inner `<View ref>` uses:
  1. `onLayout` → `measureInWindow` (once) to get container bottom in window coords
  2. `keyboardDidShow` → `containerBottom + StatusBar.currentHeight - screenY` = exact overlap
  3. `paddingBottom: overlap` applied to the inner View
  4. `switchingToEmojiRef` prevents flicker during keyboard→emoji transition

Do NOT change this to use KAV on Android. Do NOT use `Dimensions.get('window').height` (different coordinate system than `screenY`).

## i18n Rules

- **Every UI change must be translated into all 5 languages** (ES, EN, FR, PT, DE) before modifying components.
- Locale files: `src/locales/{es,en,fr,pt,de}.json` (~959 lines each)
- Language selected on first launch (`app/(auth)/language-select.tsx`), stored in AsyncStorage (`@dogly_language`, `@dogly_lang_selected`).
- Run `npx expo start --clear` after changing locale JSON files.

## Courses Module

- All course text in locale files under `owner.coursesPage.<key>`. Never hardcode course text.
- Each course has a `difficulty` key mapping to `DIFFICULTY_COLORS`.
- To add a course: add translations to all 5 locales → add course object → add to `COURSES` array.
- 10 courses implemented: sit, lie, name, come, stay, leash, paw, place, distraction, drop.

## Theme (`src/theme/index.ts`)

- Primary: `#F5A623` (warm orange), Secondary: `#2D9CDB` (teal)
- Spacing: xs(4), sm(8), md(16), lg(24), xl(32), xxl(48)
- Font sizes: xs(12) to title(34)
- Shadows: sm/md/lg with elevation

## Metro Config

`metro.config.js` must **extend** Expo's default `blockList`, not replace it. The project-level `functions/` folder is excluded via negative lookahead regex to avoid blocking `node_modules/firebase/functions`.

## AI Role System

`ai-system/roles/` contains behavior constraint prompts (architect, firebase, mvp, payments, security). Respect these when making architectural decisions.

## Auth Flow

- `app/index.tsx` checks AsyncStorage for first-launch language selection, then routes based on auth state.
- Login uses `awaitingAuth` flag + `useEffect` to wait for AuthContext before navigating.
- AuthContext uses `AppState` listener to refresh Custom Claims on foreground (catches revoked admin without re-login).
- `Promise.allSettled` in auth init so user doc failure doesn't crash the app.

## Known TypeScript Errors (non-blocking)

- `firebase.ts`: `getReactNativePersistence` export mismatch with firebase SDK types

## File Inventory

| Area | Files | Lines |
|------|-------|-------|
| Route screens (`app/`) | 21 | ~7,850 |
| Services (`src/services/`) | 10 | ~960 |
| Components (`src/components/`) | 8 | ~1,030 |
| Theme + Types + Config | 4 | ~305 |
| Locale files | 5 | ~4,795 |
| Cloud Functions | 7 | ~1,410 |
| Rules (Firestore + Storage) | 2 | ~292 |
| **Total source** | **57** | **~16,640** |
