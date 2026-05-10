import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import Anthropic from "@anthropic-ai/sdk";

const db = admin.firestore();
const storage = admin.storage();

const COIN_COST = 10;
const DAILY_LIMIT = 5;          // identifications per user per UTC day
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
// Haiku 4.5 — best price/perf for vision. Vision input ~$0.0005 per image.
const MODEL_ID = "claude-haiku-4-5-20251001";

const ERROR_CODES = {
  user_not_found: "user_not_found",
  insufficient_coins: "insufficient_coins",
  daily_limit_reached: "daily_limit_reached",
  image_too_large: "image_too_large",
  image_not_found: "image_not_found",
  ai_error: "ai_error",
  parse_error: "ai_parse_error",
};

function utcDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

interface AiBreedResult {
  breed: string;
  confidence: number;          // 0..1
  alternates: { name: string; probability: number }[];
  temperament: string;
  careTips: string;
  notes?: string;              // disclaimers, edge cases
}

const LANG_NAMES: Record<string, string> = {
  es: "Spanish",
  en: "English",
  fr: "French",
  pt: "Portuguese",
  de: "German",
};

function buildPrompt(language: string): string {
  const langCode = LANG_NAMES[language] ? language : "es";
  const langName = LANG_NAMES[langCode];
  return `You are a veterinary expert specialized in dog breed identification.

Analyze the photo and identify the dog's breed. Respond ONLY with valid JSON, no prose, in this exact shape:

{
  "breed": "Most likely breed name",
  "confidence": 0.0-1.0,
  "alternates": [
    {"name": "Second guess", "probability": 0.0-1.0},
    {"name": "Third guess", "probability": 0.0-1.0}
  ],
  "temperament": "Brief 1-2 sentence description of typical temperament",
  "careTips": "Brief 2-3 sentence care/exercise tips",
  "notes": "Optional caveats (e.g. 'photo blurry', 'looks like a mix')"
}

LANGUAGE — CRITICAL: ALL string values (breed, alternates[].name, temperament, careTips, notes) MUST be written in ${langName}. Use ${langName} breed names (for example, in Spanish say "Pastor alemán" not "German Shepherd"; in French "Berger allemand"; in German "Deutscher Schäferhund"). Do NOT mix languages. The JSON keys must remain in English.

Rules:
- If the image is NOT a dog, set breed to "no_dog" (literal, not translated) and confidence to 0.
- If the dog is clearly a mixed breed, name the dominant breed plus a localised suffix meaning "mix" (Spanish: "mestizo", English: "mix", etc.).
- confidence: 0.9+ only when very sure. Use 0.6-0.8 for likely. Below 0.5 if unsure.
- Keep all string fields under 200 characters.
- Return at most 3 alternates.`;
}

function parseAiResponse(text: string): AiBreedResult | null {
  // Claude sometimes wraps JSON in ```json ... ``` or adds a prefix. Strip first.
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (typeof parsed.breed !== "string") return null;
    return {
      breed: String(parsed.breed).slice(0, 200),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
      alternates: Array.isArray(parsed.alternates)
        ? parsed.alternates.slice(0, 3).map((a: any) => ({
            name: String(a.name ?? "").slice(0, 200),
            probability: Math.max(0, Math.min(1, Number(a.probability) || 0)),
          }))
        : [],
      temperament: String(parsed.temperament ?? "").slice(0, 500),
      careTips: String(parsed.careTips ?? "").slice(0, 500),
      notes: parsed.notes ? String(parsed.notes).slice(0, 300) : undefined,
    };
  } catch {
    return null;
  }
}

export const identifyBreed = functions
  .runWith({ secrets: ["ANTHROPIC_API_KEY"], memory: "512MB", timeoutSeconds: 60 })
  .https.onRequest(async (req, res) => {
    const allowedOrigin = process.env.APP_ORIGIN ?? "https://dogly-train.web.app";
    res.set("Access-Control-Allow-Origin", allowedOrigin);
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Methods", "POST");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // Verify Firebase ID token
    const authHeader = req.headers.authorization ?? "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!idToken) { res.status(401).json({ error: "Unauthorized" }); return; }
    let uid: string;
    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      uid = decoded.uid;
    } catch {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    const { storagePath, dogId, language } = req.body ?? {};
    if (!storagePath || typeof storagePath !== "string") {
      res.status(400).json({ error: "Missing storagePath" });
      return;
    }
    if (dogId && typeof dogId !== "string") {
      res.status(400).json({ error: "Invalid dogId" });
      return;
    }
    const langCode = typeof language === "string" && LANG_NAMES[language] ? language : "es";

    // Path must live under breed_uploads/<uid>/ to ensure the uploader is the caller
    if (!storagePath.startsWith(`breed_uploads/${uid}/`)) {
      res.status(403).json({ error: "Forbidden path" });
      return;
    }

    // Daily rate limit (separate from coin cost)
    const today = utcDateStr(new Date());
    const limitRef = db.collection("ai_usage").doc(`${uid}_${today}`);

    let postDeductBalance = 0;
    try {
      // 1. Atomic: check & deduct coins, increment daily counter.
      await db.runTransaction(async (tx) => {
        const userRef = db.collection("users").doc(uid);
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) {
          const e = new Error("user_not_found"); (e as any).code = "user_not_found"; throw e;
        }
        const data = userSnap.data()!;
        const balance = data.coinBalance ?? 0;
        if (balance < COIN_COST) {
          const e = new Error("insufficient_coins"); (e as any).code = "insufficient_coins"; throw e;
        }
        const limitSnap = await tx.get(limitRef);
        const used = limitSnap.exists ? (limitSnap.data()?.breedIdentify ?? 0) : 0;
        if (used >= DAILY_LIMIT) {
          const e = new Error("daily_limit_reached"); (e as any).code = "daily_limit_reached"; throw e;
        }

        const newBalance = balance - COIN_COST;
        postDeductBalance = newBalance;
        tx.update(userRef, {
          coinBalance: newBalance,
          updatedAt: admin.firestore.Timestamp.now(),
        });
        const txRef = db.collection("coin_transactions").doc();
        tx.set(txRef, {
          userId: uid,
          type: "ai_breed_identify",
          amount: -COIN_COST,
          balanceAfter: newBalance,
          reference: `breed_${Date.now()}`,
          createdAt: admin.firestore.Timestamp.now(),
        });
        if (limitSnap.exists) {
          tx.update(limitRef, {
            breedIdentify: admin.firestore.FieldValue.increment(1),
            updatedAt: admin.firestore.Timestamp.now(),
          });
        } else {
          tx.set(limitRef, {
            userId: uid,
            day: today,
            breedIdentify: 1,
            updatedAt: admin.firestore.Timestamp.now(),
          });
        }
      });

      // 2. Download image from Storage
      const bucket = storage.bucket();
      const file = bucket.file(storagePath);
      const [exists] = await file.exists();
      if (!exists) {
        // Refund the coins since we couldn't actually run the AI.
        await refundCoins(uid, "image_not_found");
        res.status(400).json({ error: ERROR_CODES.image_not_found });
        return;
      }
      const [meta] = await file.getMetadata();
      const sizeNum = typeof meta.size === "string" ? parseInt(meta.size, 10) : (meta.size ?? 0);
      if (sizeNum > MAX_IMAGE_BYTES) {
        await refundCoins(uid, "image_too_large");
        res.status(400).json({ error: ERROR_CODES.image_too_large });
        return;
      }
      const [buffer] = await file.download();
      const mediaType = meta.contentType && meta.contentType.startsWith("image/")
        ? (meta.contentType as "image/jpeg" | "image/png" | "image/webp" | "image/gif")
        : "image/jpeg";

      // 3. Call Claude Vision
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        await refundCoins(uid, "missing_api_key");
        functions.logger.error("ANTHROPIC_API_KEY secret not configured");
        res.status(500).json({ error: ERROR_CODES.ai_error });
        return;
      }
      const anthropic = new Anthropic({ apiKey });

      let aiText: string;
      try {
        const response = await anthropic.messages.create({
          model: MODEL_ID,
          max_tokens: 600,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: mediaType,
                    data: buffer.toString("base64"),
                  },
                },
                { type: "text", text: buildPrompt(langCode) },
              ],
            },
          ],
        });
        const block = response.content.find((c) => c.type === "text");
        aiText = block && block.type === "text" ? block.text : "";
      } catch (err: any) {
        await refundCoins(uid, "anthropic_error");
        functions.logger.error("Anthropic API error", { uid, err: err?.message });
        res.status(502).json({ error: ERROR_CODES.ai_error });
        return;
      }

      const parsed = parseAiResponse(aiText);
      if (!parsed) {
        await refundCoins(uid, "parse_error");
        functions.logger.warn("Could not parse AI response", { uid, aiText: aiText.slice(0, 200) });
        res.status(502).json({ error: ERROR_CODES.parse_error });
        return;
      }

      // 4. Save the identification record + (optionally) attach to dog
      const recordRef = db.collection("breed_identifications").doc();
      const record = {
        userId: uid,
        dogId: dogId ?? null,
        storagePath,
        breed: parsed.breed,
        confidence: parsed.confidence,
        alternates: parsed.alternates,
        temperament: parsed.temperament,
        careTips: parsed.careTips,
        notes: parsed.notes ?? null,
        createdAt: admin.firestore.Timestamp.now(),
      };
      await recordRef.set(record);

      res.status(200).json({
        success: true,
        identificationId: recordRef.id,
        newCoinBalance: postDeductBalance,
        ...parsed,
      });
    } catch (error: any) {
      const code: string = error.code ?? "";
      const clientError = (ERROR_CODES as any)[code] ?? "ai_error";
      functions.logger.warn("identifyBreed rejected", { uid, code });
      res.status(400).json({ error: clientError });
    }
  });

/** Refund the deducted coins AND decrement the daily counter when the AI step
 *  fails. We charge the coin cost up-front to reserve it, but a failure means
 *  the user got nothing — they shouldn't be penalised against the daily quota
 *  either. Best-effort; logs on failure. */
async function refundCoins(uid: string, reason: string): Promise<void> {
  const today = utcDateStr(new Date());
  const limitRef = db.collection("ai_usage").doc(`${uid}_${today}`);
  try {
    await db.runTransaction(async (tx) => {
      const userRef = db.collection("users").doc(uid);
      const [userSnap, limitSnap] = await Promise.all([tx.get(userRef), tx.get(limitRef)]);
      if (!userSnap.exists) return;
      const balance = userSnap.data()?.coinBalance ?? 0;
      const newBalance = balance + COIN_COST;
      tx.update(userRef, {
        coinBalance: newBalance,
        updatedAt: admin.firestore.Timestamp.now(),
      });
      // Decrement the daily counter. Use FieldValue.increment(-1) but clamp
      // floor at 0 if the doc was missing/lower (defensive).
      if (limitSnap.exists) {
        const used = limitSnap.data()?.breedIdentify ?? 0;
        if (used > 0) {
          tx.update(limitRef, {
            breedIdentify: admin.firestore.FieldValue.increment(-1),
            updatedAt: admin.firestore.Timestamp.now(),
          });
        }
      }
      const txRef = db.collection("coin_transactions").doc();
      tx.set(txRef, {
        userId: uid,
        type: "ai_breed_refund",
        amount: COIN_COST,
        balanceAfter: newBalance,
        reference: `refund_${reason}_${Date.now()}`,
        createdAt: admin.firestore.Timestamp.now(),
      });
    });
  } catch (e) {
    functions.logger.error("Refund failed", { uid, reason, error: (e as any)?.message });
  }
}
