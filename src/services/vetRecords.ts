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
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { VetRecord, VetRecordType, VetSeverity } from '../types';

const COLLECTION = 'vet_records';

const TITLE_MAX = 120;
const NAME_MAX = 80;
const CLINIC_MAX = 120;
const NOTES_MAX = 1000;
const PRODUCT_MAX = 120;
const BATCH_MAX = 60;

const RECORD_LIMIT = 200; // safety cap per dog

// ── CRUD ─────────────────────────────────────────────────────────────────────

export interface CreateVetRecordInput {
  userId: string;
  dogId: string;
  type: VetRecordType;
  date: Date;
  title: string;
  vetName?: string;
  clinic?: string;
  notes?: string;
  attachmentURL?: string;
  attachmentMime?: string;
  productName?: string;
  batchNumber?: string;
  nextDueAt?: Date;
  severity?: VetSeverity;
}

function clip(s: string | undefined, max: number): string | undefined {
  if (s === undefined) return undefined;
  const v = s.trim();
  if (!v) return undefined;
  return v.slice(0, max);
}

function buildPayload(input: CreateVetRecordInput) {
  const title = input.title.trim().slice(0, TITLE_MAX);
  if (!title) throw new Error('Vet record title is required');

  const data: Record<string, unknown> = {
    userId: input.userId,
    dogId: input.dogId,
    type: input.type,
    title,
    date: Timestamp.fromDate(input.date),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  const vetName = clip(input.vetName, NAME_MAX);
  if (vetName) data.vetName = vetName;
  const clinic = clip(input.clinic, CLINIC_MAX);
  if (clinic) data.clinic = clinic;
  const notes = clip(input.notes, NOTES_MAX);
  if (notes) data.notes = notes;
  if (input.attachmentURL) data.attachmentURL = input.attachmentURL;
  if (input.attachmentMime) data.attachmentMime = input.attachmentMime;

  const productName = clip(input.productName, PRODUCT_MAX);
  if (productName) data.productName = productName;
  const batchNumber = clip(input.batchNumber, BATCH_MAX);
  if (batchNumber) data.batchNumber = batchNumber;
  if (input.nextDueAt) data.nextDueAt = Timestamp.fromDate(input.nextDueAt);
  if (input.severity) data.severity = input.severity;

  return data;
}

export async function createVetRecord(input: CreateVetRecordInput): Promise<string> {
  const payload = buildPayload(input);
  const ref = await addDoc(collection(db, COLLECTION), payload);
  return ref.id;
}

export async function updateVetRecord(
  id: string,
  patch: Partial<Omit<CreateVetRecordInput, 'userId' | 'dogId'>>,
): Promise<void> {
  const data: Record<string, unknown> = { updatedAt: Timestamp.now() };
  if (patch.type !== undefined) data.type = patch.type;
  if (patch.title !== undefined) data.title = patch.title.trim().slice(0, TITLE_MAX);
  if (patch.date !== undefined) data.date = Timestamp.fromDate(patch.date);
  if (patch.vetName !== undefined) data.vetName = clip(patch.vetName, NAME_MAX) ?? null;
  if (patch.clinic !== undefined) data.clinic = clip(patch.clinic, CLINIC_MAX) ?? null;
  if (patch.notes !== undefined) data.notes = clip(patch.notes, NOTES_MAX) ?? null;
  if (patch.attachmentURL !== undefined) data.attachmentURL = patch.attachmentURL ?? null;
  if (patch.attachmentMime !== undefined) data.attachmentMime = patch.attachmentMime ?? null;
  if (patch.productName !== undefined) data.productName = clip(patch.productName, PRODUCT_MAX) ?? null;
  if (patch.batchNumber !== undefined) data.batchNumber = clip(patch.batchNumber, BATCH_MAX) ?? null;
  if (patch.nextDueAt !== undefined) data.nextDueAt = patch.nextDueAt ? Timestamp.fromDate(patch.nextDueAt) : null;
  if (patch.severity !== undefined) data.severity = patch.severity ?? null;

  await updateDoc(doc(db, COLLECTION, id), data);
}

export async function deleteVetRecord(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}

/**
 * All records for a dog, sorted by date desc (most recent first).
 * Includes userId filter so Firestore rules accept the query.
 */
export async function getVetRecords(dogId: string, userId: string): Promise<VetRecord[]> {
  const q = query(
    collection(db, COLLECTION),
    where('userId', '==', userId),
    where('dogId', '==', dogId),
    orderBy('date', 'desc'),
    limit(RECORD_LIMIT),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as VetRecord));
}
