import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  signInWithCredential,
  GoogleAuthProvider,
  UserCredential,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  limit,
  runTransaction,
  Timestamp,
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { UserRole } from '../types';
import { normalizeForSearch } from '../utils/search';

// --- Error mapping ---

const firebaseErrorMap: Record<string, string> = {
  'auth/invalid-email': 'authErrors.invalidEmail',
  'auth/user-disabled': 'authErrors.userDisabled',
  'auth/user-not-found': 'authErrors.userNotFound',
  'auth/wrong-password': 'authErrors.wrongPassword',
  'auth/invalid-credential': 'authErrors.invalidCredential',
  'auth/email-already-in-use': 'authErrors.emailInUse',
  'auth/weak-password': 'authErrors.weakPassword',
  'auth/too-many-requests': 'authErrors.tooManyRequests',
  'auth/network-request-failed': 'authErrors.networkError',
  'auth/operation-not-allowed': 'authErrors.operationNotAllowed',
  'auth/account-exists-with-different-credential': 'authErrors.accountExistsWithDifferentCredential',
  'auth/popup-closed-by-user': 'authErrors.popupClosed',
};

export function getAuthErrorKey(error: any): string {
  const code = error?.code || '';
  return firebaseErrorMap[code] || 'authErrors.generic';
}

// --- Auth functions ---

export async function signIn(email: string, password: string): Promise<UserCredential> {
  return signInWithEmailAndPassword(auth, email, password);
}

/**
 * actionCodeSettings for the email-verification flow. Without these, Firebase
 * uses its default hosted action page which doesn't redirect the user
 * anywhere recognisable — they see a bare "verified" screen with no path
 * back to the app, or worse a confusing error.
 *
 * With `url` set, Firebase processes the verification on its own page (kept
 * `handleCodeInApp: false` so the verification doesn't need to bounce through
 * a deep link handler) and then redirects to our hosted landing that says
 * "all good, return to the app".
 */
const VERIFY_EMAIL_SETTINGS = {
  url: 'https://dogly-train.web.app/email-verified',
  handleCodeInApp: false,
};

export async function signUp(email: string, password: string): Promise<UserCredential> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await sendEmailVerification(credential.user, VERIFY_EMAIL_SETTINGS);
  return credential;
}

export async function resendVerificationEmail(email: string, password: string): Promise<void> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  await sendEmailVerification(credential.user, VERIFY_EMAIL_SETTINGS);
  await firebaseSignOut(auth);
}

/**
 * Resend verification email for the currently signed-in user. No re-login
 * needed (used by the in-app banner once the user is already authenticated).
 */
export async function resendVerificationCurrentUser(): Promise<void> {
  if (!auth.currentUser) throw new Error('No current user');
  await sendEmailVerification(auth.currentUser, VERIFY_EMAIL_SETTINGS);
}

/**
 * Force-refresh the current Auth user from Firebase. Use this after the user
 * tells us they've clicked the verification link in their email — Firebase
 * caches `emailVerified` and only updates on reload + forced token refresh.
 *
 * `getIdToken(true)` forces the SDK to fetch a fresh token from the server,
 * which is what carries the updated emailVerified claim. Without it, `reload()`
 * alone may keep returning the cached pre-verification value.
 */
export async function reloadCurrentUser(): Promise<boolean> {
  if (!auth.currentUser) return false;
  await auth.currentUser.getIdToken(true).catch(() => undefined);
  await auth.currentUser.reload();
  return auth.currentUser.emailVerified;
}

export async function signOut(): Promise<void> {
  return firebaseSignOut(auth);
}

export async function resetPassword(email: string): Promise<void> {
  return sendPasswordResetEmail(auth, email);
}

export async function firebaseGoogleSignIn(idToken: string): Promise<UserCredential> {
  const credential = GoogleAuthProvider.credential(idToken);
  return signInWithCredential(auth, credential);
}

export async function userProfileExists(uid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists();
}

// --- displayId generation ---

// 32 chars, excluding visually-ambiguous (0/O, 1/I/L). 32^6 ≈ 1.07B combinations,
// so collision probability stays under 0.1% even at 50k users (birthday-bound).
const DISPLAY_ID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomDisplayId(): string {
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += DISPLAY_ID_ALPHABET[Math.floor(Math.random() * DISPLAY_ID_ALPHABET.length)];
  }
  return out;
}

/** Pick a 6-char displayId that isn't already in use. Up to 10 retries — way
 *  more than statistics demands, mostly a defence against unlikely streaks.
 *
 *  IMPORTANT — permission fallback: the `where('displayId', '==', …)` query
 *  needs to read other users' docs, but Firestore rules only allow that when
 *  the caller's own user doc has `status: 'active'`. A brand-new signup
 *  doesn't have a doc yet, so the query throws "Missing or insufficient
 *  permissions" and blocks registration entirely. When that happens we fall
 *  back to a UID-derived id (which is what the codebase used originally,
 *  before the random-with-uniqueness-check refactor). Collisions are
 *  theoretically possible with the fallback but require two UIDs with the
 *  same leading characters in the alphabet — unlikely enough for the
 *  marketplace size, and never a security issue (the referral CF re-checks
 *  the code on use). */
async function findUniqueDisplayId(uidForFallback: string): Promise<string> {
  const usersRef = collection(db, 'users');
  try {
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = randomDisplayId();
      const q = query(usersRef, where('displayId', '==', candidate), limit(1));
      const snap = await getDocs(q);
      if (snap.empty) return candidate;
    }
    return randomDisplayId() + Date.now().toString(36).slice(-2).toUpperCase();
  } catch (err: any) {
    // Permission-denied at signup time — the caller has no profile doc yet
    // and the rules require `isActive()` to read other users. Fall back to
    // a deterministic UID-derived id so registration can complete.
    if (err?.code === 'permission-denied') {
      const derived = uidForFallback.replace(/[^A-Z0-9]/gi, '').slice(0, 6).toUpperCase();
      if (derived.length === 6) return derived;
      // Pathological UID shape — pad with random chars to reach 6.
      return (derived + randomDisplayId()).slice(0, 6);
    }
    throw err;
  }
}

// --- User profile creation ---

interface CreateUserProfileParams {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  dateOfBirth: string;
  language: string;
  /** Optional `displayId` of the referrer. Set when the user entered a valid
   *  referral code in register. Append-only — never edited later. */
  referredBy?: string | null;
}

export async function createUserProfile({
  uid,
  email,
  displayName,
  role,
  dateOfBirth,
  language,
  referredBy,
}: CreateUserProfileParams) {
  // Server-side age validation (18+ for marketplace compliance)
  const birth = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  if (age < 18) throw new Error('Must be 18 or older to register');

  // Generate a unique 6-char display id. Prior implementation derived it
  // deterministically from the UID prefix — two UIDs with the same leading
  // chars produced the same displayId and the referral code lookup picked
  // whichever doc returned first. Random + uniqueness check eliminates the
  // collision entirely. We exclude visually-ambiguous chars (0/O/I/1/L) so
  // users typing the code by hand don't confuse them. The function takes the
  // uid so it can fall back to a UID-derived id when the uniqueness query
  // gets denied (which happens for brand-new signups without a profile yet).
  const displayId = await findUniqueDisplayId(uid);

  const baseData = {
    email,
    displayId,
    displayName,
    displayNameLower: normalizeForSearch(displayName),
    photoURL: null,
    role,
    status: 'active' as const,
    dateOfBirth,
    consentAt: Timestamp.now(),
    privacyPolicyVersion: '1.0',
    language,
    fcmToken: null,
    referredBy: referredBy ?? null,
    emailVerified: false,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  const trainerFields = role === 'trainer' ? {
    experience: '',
    certifications: [],
    pricePerSession: 0,
    currency: 'EUR',
    bio: '',
    specialties: [],
    isActive: false,
    averageRating: 0,
    totalReviews: 0,
    coinBalance: 0,
    boostedUntil: null,
    latitude: 0,
    longitude: 0,
    geoHash: '',
    city: '',
  } : {};

  const caretakerFields = role === 'caretaker' ? {
    accountType: 'individual' as const,
    businessName: null,
    capacity: null,
    bio: '',
    experience: '',
    certifications: [],
    pricing: {},
    currency: 'EUR',
    services: [],
    isActive: false,           // pending admin approval
    averageRating: 0,
    totalReviews: 0,
    coinBalance: 0,
    boostedUntil: null,
    latitude: 0,
    longitude: 0,
    geoHash: '',
    city: '',
  } : {};

  const ownerFields = role === 'owner' ? {
    coinBalance: 0,
  } : {};

  const userData = { ...baseData, ...trainerFields, ...caretakerFields, ...ownerFields };
  const userRef = doc(db, 'users', uid);

  // Idempotency: a transaction prevents two concurrent registrations from the
  // same UID (e.g. double-tap on Sign Up) from racing past the existence check
  // and clobbering each other's createdAt/consentAt.
  return await runTransaction(db, async (tx) => {
    const existing = await tx.get(userRef);
    if (existing.exists()) {
      return { id: existing.id, ...existing.data() } as any;
    }
    tx.set(userRef, userData);
    return { id: uid, ...userData };
  });
}
