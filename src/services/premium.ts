import { auth } from '../config/firebase';

const STRIPE_URL = 'https://us-central1-dogly-train.cloudfunctions.net/createPremiumCheckoutStripe';
const PAYPAL_URL = 'https://us-central1-dogly-train.cloudfunctions.net/createPremiumOrderPaypal';

/**
 * Custom error returned when the user tries to buy premium but already has it.
 * Caller can catch and show a friendly message.
 */
export class AlreadyPremiumError extends Error {
  constructor() {
    super('already_premium');
    this.name = 'AlreadyPremiumError';
  }
}

async function postWithAuth(url: string, userId: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const idToken = await user.getIdToken();

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({ userId }),
  });

  if (response.status === 409) {
    throw new AlreadyPremiumError();
  }
  if (!response.ok) {
    throw new Error('Failed to create premium checkout');
  }

  const data = await response.json();
  return data.url;
}

/**
 * Create a Stripe Checkout session for the premium upgrade.
 * Returns the URL the user must be redirected to.
 * Throws AlreadyPremiumError if user already has premium.
 */
export function createPremiumCheckoutStripe(userId: string): Promise<string> {
  return postWithAuth(STRIPE_URL, userId);
}

/**
 * Create a PayPal order for the premium upgrade.
 * Returns the PayPal approval URL.
 * Throws AlreadyPremiumError if user already has premium.
 */
export function createPremiumOrderPaypal(userId: string): Promise<string> {
  return postWithAuth(PAYPAL_URL, userId);
}
