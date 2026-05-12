import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { callCF, CFError } from '../utils/cfClient';
import { CoinTransaction } from '../types';

/**
 * Get transaction history for a user (most recent first)
 */
export async function getTransactionHistory(
  userId: string,
  maxResults: number = 50
): Promise<CoinTransaction[]> {
  const q = query(
    collection(db, 'coin_transactions'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(maxResults)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as CoinTransaction));
}

/**
 * Request a Stripe Checkout session from Cloud Function.
 * Returns the checkout URL to redirect the user.
 *
 * NOTE: This calls a Cloud Function endpoint.
 * The actual coin credit happens via webhook on the server side.
 */
export async function createCheckoutSession(
  userId: string,
  packageId: string
): Promise<string> {
  const data = await callCF<{ url: string }>('createCheckoutSession', { userId, packageId });
  return data.url; // Stripe Checkout URL
}

/**
 * Request a PayPal order from Cloud Function.
 * Returns the PayPal approval URL to redirect the user.
 */
export async function createPaypalOrder(
  userId: string,
  packageId: string
): Promise<string> {
  const data = await callCF<{ url: string }>('createPaypalOrder', { userId, packageId });
  return data.url;
}

/**
 * Request boost activation from Cloud Function.
 * Server checks balance, deducts coins, sets boostedUntil.
 *
 * Re-throws CFError-friendly Error so the existing UI consumers (which inspect
 * `error.message` for codes like 'insufficient_coins') keep working.
 */
export async function activateBoost(userId: string): Promise<void> {
  try {
    await callCF('activateBoost', { userId });
  } catch (err) {
    if (err instanceof CFError) {
      // Preserve the legacy error.message-based interface for the UI.
      throw new Error(err.code === 'unknown' ? 'boost_failed' : err.code);
    }
    // Non-CFError → network/runtime failure.
    console.warn('activateBoost network error', (err as Error)?.message ?? err);
    throw new Error('network_error');
  }
}
