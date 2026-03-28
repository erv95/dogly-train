import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  UserCredential,
} from 'firebase/auth';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { UserRole } from '../types';

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

export async function signOut(): Promise<void> {
  return firebaseSignOut(auth);
}

export async function resetPassword(email: string): Promise<void> {
  return sendPasswordResetEmail(auth, email);
}

// --- User profile creation ---

interface CreateUserProfileParams {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  dateOfBirth: string;
  language: string;
}

export async function createUserProfile({
  uid,
  email,
  displayName,
  role,
  dateOfBirth,
  language,
}: CreateUserProfileParams) {
  const baseData = {
    email,
    displayName,
    photoURL: null,
    role,
    status: 'active' as const,
    dateOfBirth,
    consentAt: Timestamp.now(),
    privacyPolicyVersion: '1.0',
    language,
    fcmToken: null,
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

  const ownerFields = role === 'owner' ? {
    coinBalance: 0,
  } : {};

  const userData = { ...baseData, ...trainerFields, ...ownerFields };
  await setDoc(doc(db, 'users', uid), userData);
  return { id: uid, ...userData };
}
