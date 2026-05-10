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
import { doc, getDoc, setDoc, runTransaction, Timestamp } from 'firebase/firestore';
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

export async function signUp(email: string, password: string): Promise<UserCredential> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await sendEmailVerification(credential.user);
  return credential;
}

export async function resendVerificationEmail(email: string, password: string): Promise<void> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  await sendEmailVerification(credential.user);
  await firebaseSignOut(auth);
}

/**
 * Resend verification email for the currently signed-in user. No re-login
 * needed (used by the in-app banner once the user is already authenticated).
 */
export async function resendVerificationCurrentUser(): Promise<void> {
  if (!auth.currentUser) throw new Error('No current user');
  await sendEmailVerification(auth.currentUser);
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
  // Server-side age validation (16+ required by GDPR)
  const birth = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  if (age < 16) throw new Error('Must be 16 or older to register');

  // Generate short readable ID from UID (6 alphanumeric chars, uppercase)
  const displayId = uid.replace(/[^A-Z0-9]/gi, '').slice(0, 6).toUpperCase();

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
