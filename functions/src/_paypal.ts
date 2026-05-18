/**
 * PayPal HTTP API helpers — single source of truth for base URL and OAuth
 * access-token retrieval. Previously duplicated byte-for-byte in paypal.ts
 * and premium.ts; an env-flag drift between the two could silently send
 * coin purchases to live and premium purchases to sandbox (or vice versa).
 */

/** PayPal API base URL — switches between live and sandbox via PAYPAL_ENV env. */
export function getPaypalBase(): string {
  return process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

/** Get an OAuth2 access token using the configured PayPal client credentials.
 *  Throws when PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are missing or when
 *  PayPal rejects the request. Callers must handle the error. */
export async function getPaypalAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("PayPal credentials not configured");

  const base64 = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${getPaypalBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${base64}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) throw new Error("Failed to get PayPal access token");
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}
