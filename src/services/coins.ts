import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '../config/firebase';
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
  // Cloud Function URL — will be set after deploying functions
  const CLOUD_FUNCTION_URL = 'https://us-central1-dogly-train.cloudfunctions.net/createCheckoutSession';

  const response = await fetch(CLOUD_FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, packageId }),
  });

  if (!response.ok) {
    throw new Error('Failed to create checkout session');
  }

  const data = await response.json();
  return data.url; // Stripe Checkout URL
}

/**
 * Request boost activation from Cloud Function.
 * Server checks balance, deducts coins, sets boostedUntil.
 */
export async function activateBoost(userId: string): Promise<void> {
  const CLOUD_FUNCTION_URL = 'https://us-central1-dogly-train.cloudfunctions.net/activateBoost';

  const response = await fetch(CLOUD_FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to activate boost');
  }
}
