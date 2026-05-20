import { Timestamp } from 'firebase/firestore';

// ============ USER ============
export type UserRole = 'owner' | 'trainer' | 'caretaker';
export type UserStatus = 'active' | 'suspended' | 'banned' | 'pending_deletion';

export interface User {
  id: string;
  displayId: string; // Short readable ID e.g. "AB12CD"
  email: string;
  displayName: string;
  /** Lowercased + accent-stripped copy of displayName, kept in sync on every
   *  write. Used by case-insensitive search queries. Optional for legacy
   *  accounts created before this field existed (auto-healed on next login). */
  displayNameLower?: string;
  photoURL: string | null;
  role: UserRole;
  status: UserStatus;
  dateOfBirth: string; // ISO date string
  /** Self-declared gender. Used ONLY to inflect greetings/messages so the app
   *  doesn't address a female user as "Bienvenido" or similar. Never visible
   *  to other users. `'unspecified'` (or missing) falls back to masculine
   *  grammar — the standard generic in Spanish. */
  gender?: 'female' | 'male' | 'unspecified';
  consentAt: Timestamp;
  privacyPolicyVersion: string;
  language: string;
  fcmToken: string | null;
  // Premium (one-time purchase to remove ads)
  isPremium?: boolean;
  premiumPurchasedAt?: Timestamp | null;
  // Marketplace approval flag — present on trainers/caretakers, absent (or false)
  // on owners. Hoisted to the base User type so admin tooling can read/write it
  // without casting (the field is admin-only writable per Firestore rules).
  isActive?: boolean;
  /** Coin wallet balance — server-side authoritative. Originally only on
   *  TrainerProfile/CaretakerProfile (boost spend); also used by owners for
   *  premium features like AI breed identification. */
  coinBalance?: number;
  /** Bizum / phone number used for off-platform booking payment. Trainers and
   *  caretakers fill this in their profile; appears in a confirmed booking's
   *  detail screen so the owner can pay them. Null = provider hasn't set it
   *  (UI prompts to coordinate via chat instead). */
  bizumPhone?: string | null;
  /** True once admin has approved the user's identity verification. Only
   *  meaningful for trainers/caretakers (owners don't get verified). Admin-only
   *  writable via Firestore rules. */
  verified?: boolean;
  verifiedAt?: Timestamp | null;
  /** UI/UX preferences, persisted server-side so they follow the user across
   *  devices. New keys go here instead of growing the User shape. */
  preferences?: {
    /** When true, useHaptics returns no-ops. Toggled from settings. */
    disableHaptics?: boolean;
    /** Persists the onboarding-seen flag server-side. AsyncStorage holds the
     *  same flag locally for cold-start gating; this one is the source of
     *  truth across reinstalls. */
    onboardingCompleted?: boolean;
    /** Owner-only. Captured in the `parent-type` screen right after
     *  complete-profile. Drives copy, tutorial steps, and the daily plan
     *  emphasis. `'puppy'` = strict <12mo focus; `'adult'` = generic;
     *  `'considering'` = adoption interest. Missing => treated as `'adult'`
     *  (legacy users keep working without forced re-onboarding). */
    parentType?: 'puppy' | 'adult' | 'considering';
    /** Owner-only. True once the mandatory tutorial has been completed.
     *  Triggers auto-start of the copilot tour on first owner home paint
     *  when false / undefined. Replay-able from settings. */
    tutorialCompleted?: boolean;
  };
  /** When the user signed up using a referral code, this stores the referrer's
   *  `displayId`. Append-only — set during register, never edited. */
  referredBy?: string | null;
  /** Mirror of Firebase Auth `emailVerified`, synced into Firestore so server
   *  triggers (referrals claim, etc) can gate on it without a token. */
  emailVerified?: boolean;
  /** Set when the user requested account deletion. Account stays in
   *  `pending_deletion` state for 30 days during which the user can restore
   *  it; after that the cron purges everything. */
  deletionScheduledFor?: Timestamp | null;
  deletionRequestedAt?: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============ TRAINER ============
export interface TrainerProfile extends User {
  role: 'trainer';
  experience: string;
  certifications: string[];
  pricePerSession: number;
  currency: string;
  bio: string;
  specialties: string[];
  isActive: boolean; // admin-controlled
  averageRating: number;
  totalReviews: number;
  coinBalance: number;
  boostedUntil: Timestamp | null;
  latitude: number;
  longitude: number;
  geoHash: string;
  city: string;
}

// ============ CARETAKER ============
export type CaretakerService = 'walks' | 'day_care' | 'overnight' | 'home_care';
export type CaretakerAccountType = 'individual' | 'business';

export interface CaretakerPricing {
  walk?: number;       // per walk
  dayCare?: number;    // per full day
  overnight?: number;  // per night
  homeCare?: number;   // per home visit
}

export interface CaretakerProfile extends User {
  role: 'caretaker';

  // Individual vs business establishment
  accountType: CaretakerAccountType;
  businessName: string | null;     // only used if accountType === 'business'
  capacity: number | null;         // simultaneous slots, used if business

  // Profile
  bio: string;
  experience: string;
  certifications: string[];

  // Pricing per service type (only entries for offered services)
  pricing: CaretakerPricing;
  currency: string;

  // Services offered (must be non-empty to appear in search)
  services: CaretakerService[];

  // Status & metrics (parallel to TrainerProfile)
  isActive: boolean;               // admin-controlled
  averageRating: number;
  totalReviews: number;
  coinBalance: number;
  boostedUntil: Timestamp | null;

  // Geolocation
  latitude: number;
  longitude: number;
  geoHash: string;
  city: string;
}

// ============ DOG ============
export type DogSex = 'male' | 'female';

export type DogIssue =
  | 'aggression'
  | 'anxiety'
  | 'barking'
  | 'pulling'
  | 'fearful'
  | 'destructive'
  | 'other';

export interface WeightEntry {
  date: string;   // 'YYYY-MM-DD' (UTC), unique per dog
  value: number;  // kg
}

// ── Emergency contacts & first-aid protocols ─────────────────────────────────
export type EmergencyRelationship = 'vet' | 'backup' | 'shelter' | 'other';

export interface EmergencyContact {
  id: string;
  userId: string;
  name: string;            // up to 80 chars
  phone: string;           // up to 30 chars (free-form, system dialer handles formatting)
  relationship: EmergencyRelationship;
  isPrimary: boolean;      // exactly one primary per user (enforced by setPrimaryContact)
  notes?: string;          // up to 200 chars
  createdAt: Timestamp;
}

// ── Places (dog-friendly POI map) ────────────────────────────────────────────
export type PlaceCategory =
  | 'park'           // Parques y zonas verdes para perros
  | 'restaurant'     // Bares/restaurantes pet-friendly
  | 'beach'          // Playas con perros permitidos
  | 'hotel'          // Hoteles/alojamientos pet-friendly
  | 'shop'           // Tiendas (pet-shops, peluquerías, etc.)
  | 'training_field' // Campos/zonas de entrenamiento
  | 'event';         // Eventos puntuales (meetups, ferias, talleres)

export type PlaceStatus = 'pending' | 'approved' | 'rejected';

/** Amenities a place may offer. Listed as chips in the place detail. */
export type PlaceAmenity =
  | 'leash_off'      // Suelta permitida
  | 'fenced'         // Vallado/cerrado
  | 'water'          // Agua disponible
  | 'shade'          // Zonas de sombra
  | 'wifi'           // WiFi
  | 'terrace'        // Terraza (restaurantes)
  | 'parking'        // Aparcamiento
  | 'small_dogs'     // Apto perros pequeños
  | 'large_dogs';    // Apto perros grandes

export interface Place {
  id: string;
  name: string;                  // up to 120 chars
  category: PlaceCategory;
  description: string;           // up to 500 chars
  latitude: number;
  longitude: number;
  geoHash: string;               // generated by geofire-common (same lib as trainers)
  city: string;                  // up to 80 chars
  country: string;               // ISO-2 or full name, up to 60 chars
  address?: string;              // up to 200 chars
  photoURL?: string | null;
  websiteURL?: string;
  contactPhone?: string;
  amenities: PlaceAmenity[];
  averageRating: number;         // 0..5, server-recomputed when ratings change
  totalRatings: number;
  // Event-only fields
  eventStartAt?: Timestamp;
  eventEndAt?: Timestamp;
  // Moderation
  status: PlaceStatus;
  submittedBy: string;           // userId of proposer
  approvedBy?: string;           // adminUid that approved
  rejectedReason?: string;       // optional admin note
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** One rating per (placeId, userId). Stored at /places/{placeId}/ratings/{userId}. */
export interface PlaceRating {
  id: string;       // == userId
  rating: number;   // 1..5
  comment?: string; // up to 500 chars
  createdAt: Timestamp;
}

/** First-aid protocol IDs. Content lives in locales under `emergency.protocols.<id>`. */
export type ProtocolId =
  | 'choking'
  | 'bleeding'
  | 'poisoning'
  | 'heat_stroke'
  | 'seizures'
  | 'cpr';

// ── Vet records (digital pet booklet) ────────────────────────────────────────
export type VetRecordType =
  | 'vaccine'
  | 'visit'
  | 'allergy'
  | 'medication'
  | 'surgery'
  | 'lab_result';

export type VetSeverity = 'low' | 'medium' | 'high';

export interface VetRecord {
  id: string;
  userId: string;
  dogId: string;
  type: VetRecordType;
  date: Timestamp;             // when it happened
  title: string;               // up to 120 chars — "Polivalente DHPPi", "Cojera pata trasera"
  vetName?: string;            // up to 80 chars
  clinic?: string;             // up to 120 chars
  notes?: string;              // up to 1000 chars — diagnostic, dose, treatment
  attachmentURL?: string;      // Firebase Storage HTTPS URL (image or PDF)
  attachmentMime?: string;     // 'image/jpeg' | 'application/pdf' …
  // Vaccine / medication specific
  productName?: string;        // up to 120 chars — "Nobivac DHPPi"
  batchNumber?: string;        // up to 60 chars
  nextDueAt?: Timestamp;       // optional follow-up date (future)
  // Allergy specific
  severity?: VetSeverity;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ── Walks ────────────────────────────────────────────────────────────────────
export type WalkWeather = 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'cold' | 'hot';
export type WalkEnergy = 'low' | 'medium' | 'high';

/** Single GPS sample captured during live tracking. Stored compact to keep
 *  documents small (one walk caps around 500 points after sampling). */
export interface RoutePoint {
  lat: number;
  lng: number;
  /** Seconds elapsed since walk started — lets us reconstruct timestamps without
   *  storing one Timestamp per point (Firestore doc size). */
  t: number;
}

export interface DogWalk {
  id: string;
  userId: string;
  dogId: string;
  date: string;             // 'YYYY-MM-DD' (UTC), used for daily aggregation
  startedAt: Timestamp;
  durationMinutes: number;  // > 0
  distanceKm?: number;      // manual entry OR auto-computed from GPS route
  weather?: WalkWeather;
  energy?: WalkEnergy;
  notes?: string;           // up to 280 chars
  /** Optional GPS route. Present only for walks captured with the live tracker.
   *  Capped at 1000 points (sampled in the client) to avoid Firestore 1MB limits. */
  route?: RoutePoint[];
  /** Average pace in minutes per km — derived at save time when route present. */
  paceMinPerKm?: number;
  /** True if this walk was captured by the GPS tracker (vs manually logged). */
  trackedByGps?: boolean;
  createdAt: Timestamp;
}

// ── Bookings (calendar + reservations, off-platform payment) ────────────────
//
// All Timestamps are UTC. The app is locked to Europe/Madrid for slot grids,
// done client-side via Intl.DateTimeFormat. Capacity per slot is 1 in v1.
// Slot grid: 30 minutes. slotId = floor(utcEpochMillis / (30*60*1000)).

export type BookingService = 'training' | 'walk' | 'day_care' | 'overnight' | 'home_care';

export type BookingStatus =
  | 'confirmed'
  | 'completed'
  | 'cancelled_by_owner'
  | 'cancelled_by_provider'
  | 'expired';

export type BookingTransition =
  | 'create'
  | 'complete'
  | 'cancel'
  | 'expire'
  | 'reminder_1h';

export interface Booking {
  id: string;
  ownerId: string;
  providerId: string;
  providerRole: 'trainer' | 'caretaker';
  // Denormalised at create time → list screens render without N+1, and the
  // booking survives provider/dog edits or deletions.
  providerDisplayName: string;
  providerPhotoURL: string | null;
  providerBizumPhone: string | null;
  ownerDisplayName: string;
  ownerPhotoURL: string | null;
  ownerPhone?: string | null;
  dogId: string;
  dogName: string;
  dogPhotoURL: string | null;
  service: BookingService;
  // Time (UTC; render in client with Europe/Madrid)
  serviceAt: Timestamp;
  serviceEndAt: Timestamp;
  durationMinutes: number;
  /** Sorted ASC slot ids the booking occupies (one entry per 30-min slot). */
  slotIds: string[];
  /** Informational EUR price copied from provider's pricing. The app does NOT
   *  charge this — payment happens off-platform via Bizum/chat. */
  priceEurInfo: number;
  status: BookingStatus;
  notes?: string;            // owner → provider, max 280 chars
  /** Photo proof of service completion. Required by `markBookingCompleted`.
   *  Either reused from a live session photo, or taken at completion time
   *  with the in-app camera. Visible to both parties on booking detail. */
  completionPhotoURL?: string | null;
  completionPhotoTakenAt?: Timestamp | null;
  /** When set, this booking is part of a recurring weekly series. seriesIndex
   *  is 1..seriesTotal. Cancelling a single occurrence keeps the rest intact;
   *  cancelling the series cascades. */
  seriesId?: string | null;
  seriesIndex?: number | null;
  seriesTotal?: number | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp | null;
  cancelledAt?: Timestamp | null;
  cancelledBy?: 'owner' | 'provider' | 'system' | null;
}

/** Metadata document for a recurring booking series. One per `createRecurringBookings`
 *  call. Bookings reference it via `seriesId`. */
export interface RecurringBookingSeries {
  id: string;
  ownerId: string;
  providerId: string;
  dogId: string;
  service: BookingService;
  durationMinutes: number;
  weeksCount: number;
  /** UTC of the first occurrence — used for ordering only. */
  firstServiceAt: Timestamp;
  /** UTC of the last occurrence start. */
  lastServiceAt: Timestamp;
  /** Local-Madrid hour/minute/dayIndex captured at creation, for DST-safe
   *  reconstruction of UTC for each occurrence. */
  localHour: number;
  localMinute: number;
  /** 0 = Monday … 6 = Sunday (matches WeeklyAvailabilityDay.dayIndex). */
  weekdayIndex: number;
  bookingIds: string[];
  createdAt: Timestamp;
  cancelledAt?: Timestamp | null;
  cancelledBy?: 'owner' | 'provider' | 'system' | null;
}

export interface WeeklyAvailabilityWindow {
  /** Minutes from local-Madrid midnight, e.g. 9 * 60 = 540 means 09:00. */
  startMin: number;
  endMin: number;
}

export interface WeeklyAvailabilityDay {
  /** 0 = Monday, 6 = Sunday (ISO). */
  dayIndex: number;
  windows: WeeklyAvailabilityWindow[];
}

export interface AvailabilityException {
  /** 'YYYY-MM-DD' in Europe/Madrid. */
  date: string;
  blocked: boolean;
  /** When `blocked = false`, custom windows that override the weekly default
   *  for this single date. */
  windows?: WeeklyAvailabilityWindow[];
}

export interface WeeklyAvailability {
  providerId: string;
  weekly: WeeklyAvailabilityDay[];     // length 7, dayIndex 0..6
  exceptions: AvailabilityException[];
  /** Min lead time before a slot starts (default 120 = 2h). */
  minLeadMinutes: number;
  /** Max horizon for booking — default 60 days. */
  maxHorizonDays: number;
  updatedAt: Timestamp;
}

export interface AvailabilityHold {
  providerId: string;
  slotId: string;
  bookingId: string;
  createdAt: Timestamp;
}

export interface BookingTransitionDoc {
  /** Doc id is `${bookingId}_${transition}`. */
  id: string;
  bookingId: string;
  transition: BookingTransition;
  appliedAt: Timestamp;
  appliedBy?: string;
}

// ── ID verification (trainers + caretakers) ─────────────────────────────────
export type IdDocumentType = 'dni' | 'passport' | 'driver_license';
export type IdVerificationStatus = 'pending' | 'verified' | 'rejected';

export interface IdVerification {
  id: string;                       // == userId (deterministic doc id)
  userId: string;
  documentType: IdDocumentType;
  /** Storage paths for the 3 uploaded photos. */
  frontPath: string;                // id_documents/{uid}/front.jpg
  backPath?: string | null;         // id_documents/{uid}/back.jpg — passport may have only one side
  selfiePath: string;               // id_documents/{uid}/selfie.jpg
  status: IdVerificationStatus;
  /** Optional admin note when rejecting. */
  rejectionReason?: string | null;
  submittedAt: Timestamp;
  reviewedAt?: Timestamp | null;
  reviewedBy?: string | null;       // admin uid
  /** Set true once Storage cleanup has run (after approval/rejection) so
   *  retries don't try to re-delete missing files. */
  documentsDeleted?: boolean;
  updatedAt: Timestamp;
}

// ── 30-day challenges ───────────────────────────────────────────────────────
export type ChallengeId =
  | 'obedience_basic_30'
  | 'socialization_30'
  | 'fun_tricks_30'
  | 'mental_active_30';

export type ChallengeDifficulty = 'beginner' | 'intermediate' | 'advanced';

/** A single day of a 30-day challenge. Static (lives in code), localised via
 *  i18n keys under `challenges.{id}.days.{day}.title|instruction`. */
export interface ChallengeDay {
  day: number;             // 1..30
  /** Optional course this day practices. Used to deep-link from the day card. */
  courseId?: string;
  estimatedMinutes: number;
  xpReward: number;
}

/** Template = catalog entry. All static content. */
export interface ChallengeTemplate {
  id: ChallengeId;
  difficulty: ChallengeDifficulty;
  /** Days 1..30, ordered. */
  days: ChallengeDay[];
}

/** Persistent progress for a (dog, challenge) pair. Doc id is
 *  `${dogId}_${templateId}` (deterministic — direct getDoc, no list query). */
export interface ChallengeProgress {
  id: string;
  userId: string;
  dogId: string;
  templateId: ChallengeId;
  startedAt: Timestamp;
  /** Sparse list of completed days; sorted ascending by day on write. */
  completions: { day: number; completedAt: Timestamp }[];
  /** True when all 30 days are completed. */
  completed: boolean;
  completedAt?: Timestamp;
  updatedAt: Timestamp;
}

// ── AI breed identification (Claude Vision via Cloud Function) ──────────────
export interface BreedAlternate {
  name: string;
  probability: number;   // 0..1
}

export interface BreedIdentification {
  id: string;
  userId: string;
  dogId?: string | null;
  storagePath: string;       // breed_uploads/<uid>/<file>
  breed: string;
  confidence: number;        // 0..1
  alternates: BreedAlternate[];
  temperament: string;
  careTips: string;
  notes?: string | null;
  createdAt: Timestamp;
}

/** Client-side response shape returned by identifyBreed callable. */
export interface BreedIdentifyResponse {
  success: true;
  identificationId: string;
  /** New coin balance after the 10-coin deduction — clients should use this to
   *  refresh local state without re-fetching the user doc. */
  newCoinBalance: number;
  breed: string;
  confidence: number;
  alternates: BreedAlternate[];
  temperament: string;
  careTips: string;
  notes?: string;
}

// ── Weekly training/care plan (auto-generated, persistent completions) ──────
export type WeeklyActivityKind =
  | 'training'   // practice a specific course
  | 'walk'       // walk of N minutes
  | 'mental'     // mental stimulation (clicker, scent, name game…)
  | 'guide'      // read/apply a behavior guide for an issue
  | 'rest';      // light/recovery day

export interface WeeklyActivity {
  /** Stable id within the week — `${dayIndex}-${kind}-${seq}`. */
  id: string;
  kind: WeeklyActivityKind;
  /** For 'training' — references a course id (e.g. 'sit'). */
  courseId?: string;
  /** For 'walk' — target duration in minutes. */
  walkMinutes?: number;
  /** For 'guide' — references a DogIssue (e.g. 'pulling'). */
  issueId?: string;
  /** For 'mental' — a small set of named mini-activities (clicker, name…). */
  mentalRef?: 'clicker' | 'scent' | 'name_game' | 'enrichment';
  /** Localization key root: `weeklyPlan.activityTitles.<titleKey>`. */
  titleKey: string;
  estimatedMinutes: number;
  completed: boolean;
  completedAt?: Timestamp;
}

export interface WeeklyDay {
  /** 0 = Monday, 6 = Sunday (ISO). */
  dayIndex: number;
  activities: WeeklyActivity[];
}

export interface WeeklyPlan {
  id: string;             // `${dogId}_${weekIso}` (deterministic)
  userId: string;
  dogId: string;
  /** ISO 8601 week format like '2026-W19'. */
  weekIso: string;
  /** Monday 00:00 UTC of this ISO week, used for ordering. */
  weekStart: Timestamp;
  days: WeeklyDay[];      // length 7
  generatedAt: Timestamp;
  updatedAt: Timestamp;
}

// ── Training preferences (questionnaire-driven personalization) ──────────────
export type DogAgeGroup = 'puppy' | 'young' | 'adult' | 'senior';
export type DogTrainingLevel = 'beginner' | 'basic' | 'intermediate' | 'advanced';
export type TrainingTime = 'short' | 'medium' | 'long';   // 5min, 15min, 30+min
export type TrainingGoal = 'basic_obedience' | 'tricks' | 'behavior' | 'socialization';

export interface TrainingPrefs {
  ageGroup: DogAgeGroup;
  currentLevel: DogTrainingLevel;
  issues: DogIssue[];
  timeAvailable: TrainingTime;
  primaryGoal: TrainingGoal;
  completedAt: Timestamp;
}

export interface Dog {
  id: string;
  ownerId: string;
  name: string;
  photoURL: string | null;
  breed: string;
  /** Whole years old. Kept for backwards compatibility with dogs created
   *  before `birthdate` was added — readers should prefer `getAgeMonths(dog)`
   *  from `src/utils/dogAge.ts` which derives a more precise value from
   *  `birthdate` when present. */
  age: number;
  /** ISO `YYYY-MM-DD`. Optional because legacy dogs don't have it. When set,
   *  drives the puppy / adult logic (`isPuppy` = age < 12 months) and the
   *  human-friendly age display ("8 meses" vs "2 años"). */
  birthdate?: string | null;
  weight: number;          // current weight (mirrors last entry of weights[])
  weights?: WeightEntry[]; // historical record, sorted ascending by date
  sex: DogSex;
  behavior: string;
  issues: DogIssue[];
  trainingPrefs?: TrainingPrefs;  // questionnaire-driven personalization
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============ HEALTH REMINDERS ============
export type ReminderType = 'vaccine' | 'vet' | 'grooming' | 'other';
export type ReminderRecurrence = 'none' | 'monthly' | 'quarterly' | 'biannual' | 'annual';

export interface DogReminder {
  id: string;
  userId: string;            // owner of the dog (security)
  dogId: string;
  dogName: string;           // denormalized for display without extra fetch
  type: ReminderType;
  title: string;             // e.g. "Vacuna anual rabia"
  notes?: string;
  dueAt: Timestamp;          // when the reminder is due
  recurrence: ReminderRecurrence;
  notificationId: string | null;  // OS-scheduled notification id (null if past due or unscheduled)
  completedAt: Timestamp | null;  // null if pending; set when one-shot completed
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============ CHAT ============
export const SYSTEM_UID = 'DOGLY_SYSTEM';

export interface Chat {
  id: string;
  participants: string[]; // [userId1, userId2]
  participantNames: Record<string, string>;
  participantPhotos: Record<string, string | null>;
  lastMessage: string;
  lastMessageAt: Timestamp;
  lastMessageBy: string;
  unreadCounts: Record<string, number>; // { [userId]: count }
  isSystemChat?: boolean;
  createdAt: Timestamp;
}

export type MessageType = 'text' | 'image' | 'file' | 'audio' | 'service_report';

/** Service categories that a caretaker can deliver and report on. Maps 1:1
 *  to `CaretakerService` minus the user-facing label differences. */
export type ServiceReportCategory = 'walk' | 'day_care' | 'overnight' | 'home_care';

export interface ServiceReport {
  category: ServiceReportCategory;
  /** 1-3 photo URLs uploaded to chat_media/{chatId}/{uid}/images/ */
  photoURLs: string[];
  /** Up to 280 chars — caretaker's note about how the service went */
  note: string;
  /** Optional duration of the service in minutes (1-720) */
  durationMinutes?: number;
  /** Optional dog energy observed during the service (reuses WalkEnergy) */
  energy?: WalkEnergy;
  /** Optional weather (reuses WalkWeather) */
  weather?: WalkWeather;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  type: MessageType;
  mediaURL?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  audioDuration?: number;
  /** Present only when type === 'service_report'. Structured caretaker report. */
  serviceReport?: ServiceReport;
  createdAt: Timestamp;
}

// ============ LIVE SESSIONS (booking tracking) ============
export type LiveSessionStatus = 'active' | 'paused' | 'ended';

/** A live tracking session attached to a single booking. Doc id == bookingId
 *  so subscribers can deep-link without an extra index lookup. */
export interface LiveSession {
  id: string;
  bookingId: string;
  ownerId: string;
  providerId: string;
  status: LiveSessionStatus;
  startedAt: Timestamp;
  endedAt?: Timestamp | null;
  /** Updated by the provider client every time it flushes new path points or
   *  uploads a photo. The cron uses lastPing to retire stale sessions when the
   *  provider's app dies/back-grounds for too long. */
  lastPing: Timestamp;
  photoCount: number;
}

/** Sub-collection: live_sessions/{bookingId}/path/{pointId}. Doc id is the
 *  recordedAt millis as a zero-padded string so they sort lexicographically
 *  with the same order as chronologically. */
export interface LivePathPoint {
  id: string;
  lat: number;
  lng: number;
  recordedAt: Timestamp;
}

/** Sub-collection: live_sessions/{bookingId}/photos/{photoId}. */
export interface LivePhoto {
  id: string;
  url: string;
  caption?: string | null;
  takenAt: Timestamp;
}

// ============ REFERRALS ============
export type ReferralStatus = 'pending' | 'claimed' | 'rejected' | 'review';

/** One referral record per (referrer, referred) pair. Doc id is
 *  `${referrerId}_${referredId}`. Created at register time, transitioned to
 *  `claimed` by the Cloud Function once both gates pass (email verified +
 *  first booking completed). */
export interface Referral {
  id: string;
  referrerId: string;
  referredId: string;
  /** Snapshot of the referrer's `displayId` at signup time, in case the user
   *  later renames (displayId is immutable but kept here for audit). */
  referrerCode: string;
  status: ReferralStatus;
  /** sha256 of the IP captured at signup — used to flag farms. */
  signupIpHash: string;
  /** Set when status transitions to claimed. Both users get +REFERRAL_BONUS_COINS. */
  claimedAt?: Timestamp | null;
  /** Set when admin rejects. */
  rejectedReason?: string | null;
  /** Filled when the same IP hash hits the threshold and the doc is parked
   *  for admin review. */
  needsReview?: boolean;
  createdAt: Timestamp;
}

/** Aggregation doc keyed by `${ipHash}_${YYYY-MM-DD}` so we can count signups
 *  per IP per day cheaply. Maintained by the register flow. */
export interface ReferralAuditDay {
  id: string;
  ipHash: string;
  day: string;          // YYYY-MM-DD UTC
  count: number;
  flaggedAt?: Timestamp | null;
}

// ============ COINS ============
export type TransactionType = 'purchase' | 'boost_spend' | 'refund' | 'referral' | 'admin_grant' | 'admin_deduct';

export interface CoinTransaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number; // positive for purchase, negative for spend
  balanceAfter: number;
  reference: string; // Stripe session ID or boost ID
  createdAt: Timestamp;
}

export interface CoinPackage {
  id: string;
  coins: number;
  price: number;
  currency: string;
}

// ============ REVIEWS ============
export interface Review {
  id: string; // format: {fromUserId}_{toUserId}
  fromUserId: string;
  toUserId: string;
  rating: number; // 1-5
  comment: string;
  createdAt: Timestamp;
  // Denormalised reviewer info for public review lists. Kept in sync by the
  // onUserUpdate trigger when the reviewer changes their name / photo.
  fromUserDisplayName?: string;
  fromUserPhotoURL?: string | null;
}

// ============ DISPUTES ============
export type DisputeReason =
  | 'no_show'             // provider didn't show up / owner didn't show up
  | 'poor_service'        // service was unsatisfactory
  | 'safety_concern'      // dog/person at risk
  | 'payment_issue'       // off-platform payment dispute
  | 'inappropriate_behavior'
  | 'other';

export type DisputeStatus = 'open' | 'resolved' | 'rejected';

export interface Dispute {
  id: string;
  bookingId: string;
  ownerId: string;
  providerId: string;
  openedBy: string;            // uid of whoever filed it
  reason: DisputeReason;
  description: string;
  status: DisputeStatus;
  createdAt: Timestamp;
  resolvedAt?: Timestamp | null;
  resolvedBy?: string | null;  // admin uid
  resolution?: string | null;  // admin-visible note
}

// ============ REPORTS ============
export type ReportReason = 'offensive' | 'spam' | 'harassment' | 'other';
export type ReportStatus = 'pending' | 'reviewed' | 'resolved';

export interface Report {
  id: string;
  reportedBy: string;
  reportedUser: string;
  chatId: string;
  reason: ReportReason;
  details: string;
  status: ReportStatus;
  createdAt: Timestamp;
}
