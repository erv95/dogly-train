/**
 * Heuristic detection of personally identifiable info (phone, email) inside
 * chat messages. Used to warn the user before they share contact details that
 * could leak the platform.
 *
 * Client-side only. Server doesn't block messages — this is purely a UX nudge.
 * False positives are intentionally tolerated: better to over-warn than miss.
 */

export interface PIIDetection {
  hasEmail: boolean;
  hasPhone: boolean;
  hasExternalApp: boolean;
}

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;

// Mention of common off-platform messaging apps. Conservative list — only
// catches the heavy hitters used to leave Dogly Train chats.
const EXTERNAL_APP_RE = /\b(whats?app|telegram|signal|instagram|facebook|fb|wechat|viber|line|messenger)\b/i;

/**
 * Detect phone numbers loosely. Spanish phones are 9 digits (starts with 6/7
 * for mobile, 9 for landline). International prefixes also captured. We strip
 * separators and check for a run of 9+ digits in the raw string.
 */
function detectPhone(text: string): boolean {
  // Strip everything that isn't digit or + and look for 9+ consecutive digits
  // anywhere in the cleaned string.
  const cleaned = text.replace(/[\s\-().·]/g, '');
  // 9+ digits in a row (allows leading +country)
  return /(\+?\d{9,})/.test(cleaned);
}

export function detectPII(text: string): PIIDetection {
  if (!text || text.length < 4) {
    return { hasEmail: false, hasPhone: false, hasExternalApp: false };
  }
  return {
    hasEmail: EMAIL_RE.test(text),
    hasPhone: detectPhone(text),
    hasExternalApp: EXTERNAL_APP_RE.test(text),
  };
}

/** Returns true if anything sensitive was detected — caller can short-circuit
 *  the "should I warn?" branch with this. */
export function shouldWarnPII(text: string): boolean {
  const d = detectPII(text);
  return d.hasEmail || d.hasPhone || d.hasExternalApp;
}
