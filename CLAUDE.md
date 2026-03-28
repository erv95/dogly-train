# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Dogly Train

Mobile app connecting dog owners with professional dog trainers. Built with Expo (React Native) + Firebase (Blaze plan).

## Tech Stack

- **Frontend:** Expo (React Native) with Expo Router, TypeScript
- **Backend:** Firebase (Auth, Firestore, Cloud Functions)
- **Payments:** Stripe Checkout + PayPal (redirect flow, webhook verification)
- **Auth:** Firebase Auth (email/password, Google, Apple, Facebook)
- **i18n:** Multi-language (ES, EN, FR, PT, DE)

## Architecture Principles

- All coin/payment logic is server-side only (Cloud Functions). Never trust client data for financial operations.
- Stripe/PayPal payments use redirect flow → webhook confirmation → server updates coin balance. No client-side payment confirmation.
- Firestore reads must be minimized aggressively: local cache (React Query), pagination, denormalized data, listeners only for active chat.
- Trainer profiles require admin activation before becoming visible (custom claims).
- Admin role is assigned via Firebase Custom Claims — not client-modifiable.
- Geolocation uses GeoHash for Firestore queries; trainers expose approximate zone only.

## AI Role System

The `ai-system/roles/` directory contains role-specific prompts that define behavior constraints:
- **architect.txt** — structure, data models, separation of concerns
- **firebase.txt** — Firestore optimization, free-tier awareness
- **mvp.txt** — ship fast, avoid unnecessary features
- **payments.txt** — Stripe Checkout redirect, webhook-only confirmation, idempotency
- **security.txt** — server-side validation, never trust client, log critical actions

These roles should be respected when making architectural decisions.

## Common Commands

```bash
# Install dependencies
npm install

# Start Expo dev server
npx expo start

# Run on specific platform
npx expo run:android
npx expo run:ios

# Deploy Firebase Cloud Functions
cd functions && npm run deploy

# Deploy Firestore rules
firebase deploy --only firestore:rules

# Run tests
npm test
```

## Key Design Decisions

- Ranking priority: boosted trainers > highest rating > closest distance
- Coin packages: 20, 50, 100, 200, 500 (20 coins = 24h boost)
- Chat is text-only with offensive language filtering and report system
- Reviews are private (visible only to receiver)
- GDPR compliant: explicit consent, user data deletion available in settings
- Age verification (16+) at registration
