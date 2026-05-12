import { callCF, CFError } from '../utils/cfClient';

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

async function callPremium(name: string, userId: string): Promise<string> {
  try {
    const data = await callCF<{ url: string }>(name, { userId });
    return data.url;
  } catch (err) {
    // The server returns HTTP 409 when the user is already premium.
    if (err instanceof CFError && (err.status === 409 || err.code === 'already_premium')) {
      throw new AlreadyPremiumError();
    }
    throw err;
  }
}

/**
 * Create a Stripe Checkout session for the premium upgrade.
 * Returns the URL the user must be redirected to.
 * Throws AlreadyPremiumError if user already has premium.
 */
export function createPremiumCheckoutStripe(userId: string): Promise<string> {
  return callPremium('createPremiumCheckoutStripe', userId);
}

/**
 * Create a PayPal order for the premium upgrade.
 * Returns the PayPal approval URL.
 * Throws AlreadyPremiumError if user already has premium.
 */
export function createPremiumOrderPaypal(userId: string): Promise<string> {
  return callPremium('createPremiumOrderPaypal', userId);
}
