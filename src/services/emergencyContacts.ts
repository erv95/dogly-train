import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  runTransaction,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { EmergencyContact, EmergencyRelationship } from '../types';

const COLLECTION = 'emergency_contacts';

const NAME_MAX = 80;
const PHONE_MAX = 30;
const NOTES_MAX = 200;
const CONTACT_LIMIT = 10; // soft cap per user — discourages address-book dumps

// ── CRUD ─────────────────────────────────────────────────────────────────────

export interface CreateContactInput {
  userId: string;
  name: string;
  phone: string;
  relationship: EmergencyRelationship;
  isPrimary?: boolean;
  notes?: string;
}

function sanitize(input: CreateContactInput): Omit<EmergencyContact, 'id'> {
  const name = input.name.trim().slice(0, NAME_MAX);
  const phone = input.phone.trim().slice(0, PHONE_MAX);
  const notes = input.notes?.trim().slice(0, NOTES_MAX);
  if (!name) throw new Error('Contact name is required');
  if (!phone) throw new Error('Phone number is required');
  return {
    userId: input.userId,
    name,
    phone,
    relationship: input.relationship,
    isPrimary: !!input.isPrimary,
    ...(notes ? { notes } : {}),
    createdAt: Timestamp.now(),
  };
}

/**
 * Create a contact. If `isPrimary` is true, atomically demotes any other primary
 * so the invariant "at most one primary per user" is preserved.
 */
export async function createEmergencyContact(input: CreateContactInput): Promise<string> {
  const data = sanitize(input);

  if (!data.isPrimary) {
    const ref = await addDoc(collection(db, COLLECTION), data);
    return ref.id;
  }

  // Need a transaction to demote previous primary atomically.
  return await runTransaction(db, async (tx) => {
    const prevPrimary = await getDocs(
      query(
        collection(db, COLLECTION),
        where('userId', '==', input.userId),
        where('isPrimary', '==', true),
        limit(5),
      ),
    );
    // Demote each previous primary (typically 0 or 1)
    prevPrimary.docs.forEach((d) => tx.update(d.ref, { isPrimary: false }));
    const newRef = doc(collection(db, COLLECTION));
    tx.set(newRef, data);
    return newRef.id;
  });
}

export async function updateEmergencyContact(
  id: string,
  data: Partial<Omit<EmergencyContact, 'id' | 'userId' | 'createdAt'>>,
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (data.name !== undefined) patch.name = data.name.trim().slice(0, NAME_MAX);
  if (data.phone !== undefined) patch.phone = data.phone.trim().slice(0, PHONE_MAX);
  if (data.relationship !== undefined) patch.relationship = data.relationship;
  if (data.notes !== undefined) {
    const trimmed = data.notes.trim().slice(0, NOTES_MAX);
    patch.notes = trimmed || null;
  }
  if (data.isPrimary !== undefined) patch.isPrimary = data.isPrimary;
  await updateDoc(doc(db, COLLECTION, id), patch);
}

export async function deleteEmergencyContact(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}

/**
 * Set a contact as primary; transactionally demotes any previous primary so
 * exactly one contact per user is marked primary.
 */
export async function setPrimaryContact(userId: string, contactId: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    // 1. Find current primaries (usually 1)
    const prev = await getDocs(
      query(
        collection(db, COLLECTION),
        where('userId', '==', userId),
        where('isPrimary', '==', true),
        limit(5),
      ),
    );
    // 2. Demote them (skip if it's already the target)
    prev.docs.forEach((d) => {
      if (d.id !== contactId) tx.update(d.ref, { isPrimary: false });
    });
    // 3. Promote the target
    tx.update(doc(db, COLLECTION, contactId), { isPrimary: true });
  });
}

/**
 * List contacts for a user. Primary first, then by created date desc.
 * Returns at most CONTACT_LIMIT entries.
 */
export async function getEmergencyContacts(userId: string): Promise<EmergencyContact[]> {
  const q = query(
    collection(db, COLLECTION),
    where('userId', '==', userId),
    orderBy('isPrimary', 'desc'),
    orderBy('createdAt', 'desc'),
    limit(CONTACT_LIMIT),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as EmergencyContact));
}

/** Convenience: only the primary contact, or null. */
export async function getPrimaryContact(userId: string): Promise<EmergencyContact | null> {
  const q = query(
    collection(db, COLLECTION),
    where('userId', '==', userId),
    where('isPrimary', '==', true),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as EmergencyContact;
}
