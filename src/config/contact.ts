/**
 * Centralised contact information. Update HERE when the production domain
 * is finalised — every screen and email template should read from these
 * constants rather than hardcoding the address.
 *
 * If the domain changes, also update:
 *   - Firebase Auth → Templates (sender + reply-to)
 *   - Privacy policy / Terms of Service
 *   - App Store / Play Store listings
 *   - DNS SPF + DKIM records (see Iter 4.1 in robust-petting-owl.md)
 */

// Pre-launch: one Gmail handles support + privacy. When we move to a custom
// domain, split these into role-based addresses (support@, privacy@, etc.)
// and update only this file.
export const SUPPORT_EMAIL = 'doglytrain@gmail.com';
export const DPO_EMAIL = 'doglytrain@gmail.com';
// Sender address for transactional email. Gmail can't be used as a custom
// SMTP sender for Firebase Auth — this constant is a placeholder until we
// configure a real domain (see Iter 4.1).
export const NO_REPLY_EMAIL = 'doglytrain@gmail.com';

/** Shown publicly on the /security page and in privacy disclosures. */
export const PUBLIC_CONTACT = {
  support: SUPPORT_EMAIL,
  privacy: DPO_EMAIL,
};
