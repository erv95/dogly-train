import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  orderBy,
  limit,
  Timestamp,
  startAfter,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { ref, uploadBytes, deleteObject } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import {
  IdDocumentType,
  IdVerification,
  IdVerificationStatus,
} from '../types';

const COLLECTION = 'id_verifications';

function pathFor(uid: string, kind: 'front' | 'back' | 'selfie'): string {
  return `id_documents/${uid}/${kind}.jpg`;
}

async function uploadJpegFromUri(uri: string, storagePath: string): Promise<void> {
  const r = await fetch(uri);
  const blob = await r.blob();
  await uploadBytes(ref(storage, storagePath), blob, { contentType: 'image/jpeg' });
}

// ── User-facing: submit / read own ─────────────────────────────────────────

export interface SubmitIdInput {
  userId: string;
  documentType: IdDocumentType;
  /** Local image URIs (from ImagePicker). Back is optional for passports. */
  frontUri: string;
  backUri?: string;
  selfieUri: string;
}

/** Upload the 3 photos to Storage and create/replace the verification doc as
 *  pending. If a previous rejected/verified doc exists for the same user it
 *  gets overwritten — they're allowed to re-submit. */
export async function submitIdVerification(input: SubmitIdInput): Promise<IdVerification> {
  if (!input.userId) throw new Error('Missing userId');
  if (!input.frontUri || !input.selfieUri) throw new Error('Front + selfie required');

  const frontPath = pathFor(input.userId, 'front');
  const backPath = input.backUri ? pathFor(input.userId, 'back') : null;
  const selfiePath = pathFor(input.userId, 'selfie');

  // Upload sequentially to avoid hammering the bucket on slow networks; image
  // sizes are small (compressed by ImagePicker quality 0.7).
  await uploadJpegFromUri(input.frontUri, frontPath);
  if (input.backUri && backPath) await uploadJpegFromUri(input.backUri, backPath);
  await uploadJpegFromUri(input.selfieUri, selfiePath);

  const data: Omit<IdVerification, 'id'> = {
    userId: input.userId,
    documentType: input.documentType,
    frontPath,
    backPath,
    selfiePath,
    status: 'pending',
    rejectionReason: null,
    submittedAt: Timestamp.now(),
    reviewedAt: null,
    reviewedBy: null,
    documentsDeleted: false,
    updatedAt: Timestamp.now(),
  };
  await setDoc(doc(db, COLLECTION, input.userId), data);
  return { id: input.userId, ...data };
}

export async function getMyIdVerification(userId: string): Promise<IdVerification | null> {
  const snap = await getDoc(doc(db, COLLECTION, userId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<IdVerification, 'id'>) };
}

// ── Admin: list / approve / reject ─────────────────────────────────────────

/** Admin-only helper: list pending (or any-status) verifications, paginated. */
export async function listVerificationsByStatus(
  status: IdVerificationStatus,
  cursor: QueryDocumentSnapshot<DocumentData> | null = null,
  pageSize: number = 30,
): Promise<{ items: IdVerification[]; nextCursor: QueryDocumentSnapshot<DocumentData> | null }> {
  const constraints = [
    where('status', '==', status),
    orderBy('submittedAt', 'desc'),
  ];
  let q = query(collection(db, COLLECTION), ...constraints, limit(pageSize));
  if (cursor) q = query(collection(db, COLLECTION), ...constraints, startAfter(cursor), limit(pageSize));
  const snap = await getDocs(q);
  return {
    items: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<IdVerification, 'id'>) })),
    nextCursor: snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1] : null,
  };
}

/**
 * Realtime count of pending verifications for the admin badge. Mirrors the
 * shape of subscribeToUnreadCount in chats.ts — auto-tears down on
 * permission-denied so a revoked admin doesn't leak a listener.
 *
 * Cap at 100 because the admin processes them in batches anyway; if the
 * queue ever exceeds 100 the badge can render "99+" client-side.
 */
export function subscribeToPendingVerificationCount(
  callback: (count: number) => void,
): () => void {
  const q = query(
    collection(db, COLLECTION),
    where('status', '==', 'pending'),
    limit(100),
  );
  let unsubInternal: (() => void) | null = null;
  unsubInternal = onSnapshot(
    q,
    (snap) => callback(snap.size),
    (err) => {
      console.warn('subscribeToPendingVerificationCount error:', err);
      if ((err as { code?: string }).code === 'permission-denied') {
        unsubInternal?.();
      }
    },
  );
  return () => unsubInternal?.();
}

/** Best-effort cleanup of the stored ID/selfie images. Call after approving
 *  or rejecting to minimise PII retention (GDPR). */
async function deleteStoredDocuments(v: IdVerification): Promise<void> {
  const paths = [v.frontPath, v.backPath, v.selfiePath].filter(Boolean) as string[];
  await Promise.allSettled(paths.map((p) => deleteObject(ref(storage, p))));
}

/** Admin: mark a verification approved + flip the user's `verified` flag.
 *  Storage docs are cleaned up afterwards. */
export async function approveIdVerification(
  v: IdVerification,
  adminUid: string,
): Promise<void> {
  const now = Timestamp.now();
  await Promise.all([
    updateDoc(doc(db, COLLECTION, v.id), {
      status: 'verified',
      reviewedAt: now,
      reviewedBy: adminUid,
      rejectionReason: null,
      updatedAt: now,
      documentsDeleted: true,
    }),
    updateDoc(doc(db, 'users', v.userId), {
      verified: true,
      verifiedAt: now,
      updatedAt: now,
    }),
  ]);
  // Clean up Storage as a non-blocking best-effort step.
  deleteStoredDocuments(v).catch(() => { /* logged server-side via console */ });
}

/** Admin: reject a verification with an optional reason. The user's `verified`
 *  flag is cleared (in case they were previously verified and re-submitted). */
export async function rejectIdVerification(
  v: IdVerification,
  adminUid: string,
  reason: string,
): Promise<void> {
  const now = Timestamp.now();
  await Promise.all([
    updateDoc(doc(db, COLLECTION, v.id), {
      status: 'rejected',
      reviewedAt: now,
      reviewedBy: adminUid,
      rejectionReason: reason.slice(0, 500),
      updatedAt: now,
      documentsDeleted: true,
    }),
    updateDoc(doc(db, 'users', v.userId), {
      verified: false,
      verifiedAt: null,
      updatedAt: now,
    }),
  ]);
  deleteStoredDocuments(v).catch(() => { /* best-effort */ });
}
