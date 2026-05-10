import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import {
  setupCors,
  verifyCallerToken,
  notifyByPush,
  REFERRAL_BONUS_COINS,
  REFERRAL_LIFETIME_CAP,
  REFERRAL_IP_FLAG_THRESHOLD,
} from "./_shared";

const db = admin.firestore();

/** Hash an IP for storage. Salt makes the hash useless if the DB leaks but
 *  same-IP detection still works because we use the same salt every time. */
function hashIp(ip: string | undefined): string {
  if (!ip) return "unknown";
  // The salt is deliberately a constant. We don't need it to be a secret —
  // it just stops casual reverse-mapping back to raw IPs from a DB dump.
  const salted = `dogly-train-referral-salt::${ip}`;
  return crypto.createHash("sha256").update(salted).digest("hex").slice(0, 32);
}

function todayKey(): string {
  return new Date().toISOString().split("T")[0]; // YYYY-MM-DD
}

/**
 * Called from `onUserCreate` (notifications.ts trigger) when the new user
 * doc has `referredBy` set. Idempotent: if the referral doc already exists,
 * no-op. Tracks IP audit so admin can flag farms.
 *
 * Internal — invoked by another function, NOT exposed as HTTP.
 */
export async function recordReferralOnSignup(args: {
  referredId: string;
  referredCode: string;     // displayId of referrer
  signupIp: string | undefined;
}): Promise<void> {
  const { referredId, referredCode, signupIp } = args;

  // Look up the referrer by displayId. If not found, silently drop — never
  // block the signup over a bad code (register validates first anyway).
  const referrerSnap = await db.collection("users")
    .where("displayId", "==", referredCode)
    .limit(1)
    .get();
  if (referrerSnap.empty) return;
  const referrerId = referrerSnap.docs[0].id;
  if (referrerId === referredId) return; // belt-and-braces self-referral guard

  const ipHash = hashIp(signupIp);
  const referralId = `${referrerId}_${referredId}`;

  // Update IP audit counter — used to flag farms ≥3 signups same IP / 24h.
  // Doc id "{ipHash}_{day}" gives us cheap per-day buckets.
  const auditRef = db.collection("referral_audit").doc(`${ipHash}_${todayKey()}`);

  await db.runTransaction(async (tx) => {
    const refDoc = await tx.get(db.collection("referrals").doc(referralId));
    if (refDoc.exists) return; // duplicate signup, skip

    const auditDoc = await tx.get(auditRef);
    const newCount = (auditDoc.exists ? auditDoc.data()?.count ?? 0 : 0) + 1;
    const flagged = newCount >= REFERRAL_IP_FLAG_THRESHOLD;

    tx.set(auditRef, {
      ipHash,
      day: todayKey(),
      count: newCount,
      flaggedAt: flagged
        ? (auditDoc.exists ? auditDoc.data()?.flaggedAt ?? admin.firestore.Timestamp.now() : admin.firestore.Timestamp.now())
        : null,
    }, { merge: true });

    tx.set(db.collection("referrals").doc(referralId), {
      referrerId,
      referredId,
      referrerCode: referredCode,
      status: flagged ? "review" : "pending",
      signupIpHash: ipHash,
      needsReview: flagged,
      createdAt: admin.firestore.Timestamp.now(),
    });
  });
}

/**
 * Called from `markBookingCompleted` after a booking transitions to completed.
 * Grants coins to BOTH parties iff:
 *   - the referral exists and is `pending` (review/claimed/rejected → no-op)
 *   - this is the referred user's FIRST completed booking
 *   - referred has emailVerified = true
 *   - referrer hasn't hit the lifetime cap
 *
 * Idempotent via `referrals.status` check inside the transaction.
 */
export async function maybeClaimReferralOnFirstBookingComplete(
  referredId: string,
): Promise<{ claimed: boolean; reason?: string }> {
  // Cheap pre-checks outside the transaction
  const userSnap = await db.collection("users").doc(referredId).get();
  if (!userSnap.exists) return { claimed: false, reason: "user_missing" };
  const u = userSnap.data() ?? {};
  if (!u.referredBy) return { claimed: false, reason: "no_referrer" };
  if (u.emailVerified !== true) return { claimed: false, reason: "email_unverified" };

  // Find referral doc by referredId — there is at most one
  const refQuery = await db.collection("referrals")
    .where("referredId", "==", referredId)
    .limit(1).get();
  if (refQuery.empty) return { claimed: false, reason: "no_referral" };
  const referralRef = refQuery.docs[0].ref;

  return await db.runTransaction(async (tx) => {
    const referralDoc = await tx.get(referralRef);
    if (!referralDoc.exists) return { claimed: false, reason: "no_referral" };
    const r = referralDoc.data()!;
    if (r.status !== "pending") {
      return { claimed: false, reason: `not_pending_${r.status}` };
    }

    const referrerId = r.referrerId as string;
    const referrerRef = db.collection("users").doc(referrerId);
    const referredRef = db.collection("users").doc(referredId);
    const [referrerSnap, referredSnap] = await Promise.all([
      tx.get(referrerRef),
      tx.get(referredRef),
    ]);
    if (!referrerSnap.exists || !referredSnap.exists) {
      return { claimed: false, reason: "user_missing" };
    }

    // Cap check — count claimed referrals
    // Note: counting outside the transaction would race; we assume
    // REFERRAL_LIFETIME_CAP is small enough that overshoot by 1 is acceptable.
    // If we need a hard cap, we can store `claimedCount` denormalised on user.
    const claimedCount = referrerSnap.data()?.referralsClaimedCount ?? 0;
    if (claimedCount >= REFERRAL_LIFETIME_CAP) {
      tx.update(referralRef, {
        status: "rejected",
        rejectedReason: "cap_reached",
      });
      return { claimed: false, reason: "cap_reached" };
    }

    const now = admin.firestore.Timestamp.now();
    const referrerBalance = (referrerSnap.data()?.coinBalance ?? 0) + REFERRAL_BONUS_COINS;
    const referredBalance = (referredSnap.data()?.coinBalance ?? 0) + REFERRAL_BONUS_COINS;

    tx.update(referrerRef, {
      coinBalance: referrerBalance,
      referralsClaimedCount: claimedCount + 1,
      updatedAt: now,
    });
    tx.update(referredRef, {
      coinBalance: referredBalance,
      updatedAt: now,
    });

    // Ledger entries — type 'referral' so the transactions screen can render
    // them with their own icon/copy.
    const ledger1 = db.collection("coin_transactions").doc();
    tx.set(ledger1, {
      userId: referrerId,
      type: "referral",
      amount: REFERRAL_BONUS_COINS,
      balanceAfter: referrerBalance,
      reference: `referral_${referralRef.id}`,
      createdAt: now,
    });
    const ledger2 = db.collection("coin_transactions").doc();
    tx.set(ledger2, {
      userId: referredId,
      type: "referral",
      amount: REFERRAL_BONUS_COINS,
      balanceAfter: referredBalance,
      reference: `referral_${referralRef.id}`,
      createdAt: now,
    });

    tx.update(referralRef, {
      status: "claimed",
      claimedAt: now,
    });

    return { claimed: true };
  });
}

// ── Public HTTP: client calls this immediately after sign-up to record the
// referral with the actual IP. Authenticated as the referred user. ──────────

export const recordReferralSignup = functions.https.onRequest(async (req, res) => {
  if (setupCors(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const caller = await verifyCallerToken(req, res);
  if (!caller) return;

  const { referredCode } = req.body ?? {};
  if (!referredCode || typeof referredCode !== "string") {
    res.status(400).json({ error: "invalid_input" });
    return;
  }

  // Pull the caller IP from the proxy headers (Firebase Hosting / GCLB).
  const ip = (req.headers["x-forwarded-for"]?.toString().split(",")[0].trim())
          || req.ip
          || undefined;

  try {
    await recordReferralOnSignup({
      referredId: caller.uid,
      referredCode: referredCode.trim().toUpperCase(),
      signupIp: ip,
    });
    res.status(200).json({ success: true });
  } catch (err: any) {
    functions.logger.error("recordReferralSignup failed", { err: err?.message });
    res.status(500).json({ error: "record_failed" });
  }
});

// ── Admin: approve / reject a referral parked for review ─────────────────────

export const adminReviewReferral = functions.https.onRequest(async (req, res) => {
  if (setupCors(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const caller = await verifyCallerToken(req, res);
  if (!caller) return;
  if (!caller.isAdmin) {
    res.status(403).json({ error: "admin_only" });
    return;
  }

  const { referralId, action, reason } = req.body ?? {};
  if (!referralId || (action !== "approve" && action !== "reject")) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }

  const ref = db.collection("referrals").doc(referralId);
  try {
    if (action === "approve") {
      await ref.update({ status: "pending", needsReview: false });
      res.status(200).json({ success: true, action });
      return;
    }
    // reject
    await ref.update({
      status: "rejected",
      rejectedReason: typeof reason === "string" ? reason.slice(0, 200) : "admin_rejected",
    });
    res.status(200).json({ success: true, action });
  } catch (err: any) {
    functions.logger.error("adminReviewReferral failed", { err: err?.message });
    res.status(500).json({ error: "review_failed" });
  }
});
