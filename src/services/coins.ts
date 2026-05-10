import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';
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
  const CLOUD_FUNCTION_URL = 'https://us-central1-dogly-train.cloudfunctions.net/createCheckoutSession';

  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const idToken = await user.getIdToken();

  const response = await fetch(CLOUD_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({ userId, packageId }),
  });

  if (!response.ok) {
    throw new Error('Failed to create checkout session');
  }

  const data = await response.json();
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
  const CLOUD_FUNCTION_URL = 'https://us-central1-dogly-train.cloudfunctions.net/createPaypalOrder';

  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const idToken = await user.getIdToken();

  const response = await fetch(CLOUD_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({ userId, packageId }),
  });

  if (!response.ok) throw new Error('Failed to create PayPal order');
  const data = await response.json();
  return data.url;
}

/**
 * Request boost activation from Cloud Function.
 * Server checks balance, deducts coins, sets boostedUntil.
 */
export async function activateBoost(userId: string): Promise<void> {
  const CLOUD_FUNCTION_URL = 'https://us-central1-dogly-train.cloudfunctions.net/activateBoost';

  const user = auth.currentUser;
  if (!user) throw new Error('unauthenticated');
  const idToken = await user.getIdToken();

  let response: Response;
  try {
    response = await fetch(CLOUD_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ userId }),
    });
  } catch (err: any) {
    // Network failure — request never reached the server (offline, DNS,
    // captive portal, etc). Surface a distinct code so the UI can show a
    // helpful message AND we know server logs won't have anything.
    console.warn('activateBoost network error', err?.message ?? err);
    throw new Error('network_error');
  }

  if (!response.ok) {
    let raw = '';
    let code = 'boost_failed';
    try {
      raw = await response.text();
      const data = JSON.parse(raw);
      if (typeof data?.error === 'string') code = data.error;
    } catch { /* not JSON */ }
    console.warn('activateBoost failed', { status: response.status, code, body: raw.slice(0, 200) });
    throw new Error(code);
  }
}
