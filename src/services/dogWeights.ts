import { doc, runTransaction, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { WeightEntry } from '../types';

/**
 * Add or update a weight entry for a dog. If an entry already exists for the
 * given date, it is replaced (one entry per day per dog).
 *
 * Uses a transaction to avoid races between concurrent writes (e.g. user adds
 * an entry while another device is editing).
 */
export async function upsertWeight(
  dogId: string,
  value: number,
  date: string
): Promise<void> {
  if (!Number.isFinite(value) || value <= 0 || value > 200) {
    throw new Error('Invalid weight value');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Invalid date format');
  }

  const dogRef = doc(db, 'dogs', dogId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(dogRef);
    if (!snap.exists()) throw new Error('Dog not found');

    const data = snap.data();
    const existing: WeightEntry[] = Array.isArray(data.weights) ? data.weights : [];

    // Remove any existing entry for the same date, then append new one
    const updated = existing.filter((w) => w.date !== date);
    updated.push({ date, value });
    updated.sort((a, b) => a.date.localeCompare(b.date));

    // Current weight = most recent entry by date
    const current = updated[updated.length - 1].value;

    tx.update(dogRef, {
      weights: updated,
      weight: current,
      updatedAt: Timestamp.now(),
    });
  });
}

/**
 * Remove a weight entry by date.
 */
export async function removeWeight(dogId: string, date: string): Promise<void> {
  const dogRef = doc(db, 'dogs', dogId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(dogRef);
    if (!snap.exists()) return;

    const data = snap.data();
    const existing: WeightEntry[] = Array.isArray(data.weights) ? data.weights : [];
    const updated = existing.filter((w) => w.date !== date);

    // Recompute current weight: last entry, or keep existing if no entries left
    const current = updated.length > 0 ? updated[updated.length - 1].value : (data.weight ?? 0);

    tx.update(dogRef, {
      weights: updated,
      weight: current,
      updatedAt: Timestamp.now(),
    });
  });
}
