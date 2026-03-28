import { Timestamp } from 'firebase/firestore';

// ============ USER ============
export type UserRole = 'owner' | 'trainer';
export type UserStatus = 'active' | 'suspended' | 'banned';

export interface User {
  id: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  role: UserRole;
  status: UserStatus;
  dateOfBirth: string; // ISO date string
  consentAt: Timestamp;
  privacyPolicyVersion: string;
  language: string;
  fcmToken: string | null;
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

export interface Dog {
  id: string;
  ownerId: string;
  name: string;
  photoURL: string | null;
  breed: string;
  age: number;
  weight: number;
  sex: DogSex;
  behavior: string;
  issues: DogIssue[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============ CHAT ============
export interface Chat {
  id: string;
  participants: string[]; // [userId1, userId2]
  participantNames: Record<string, string>;
  participantPhotos: Record<string, string | null>;
  lastMessage: string;
  lastMessageAt: Timestamp;
  lastMessageBy: string;
  createdAt: Timestamp;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  createdAt: Timestamp;
}

// ============ COINS ============
export type TransactionType = 'purchase' | 'boost_spend' | 'refund';

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
