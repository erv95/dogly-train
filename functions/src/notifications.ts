import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { db, setupCors, verifyCallerToken } from "./_shared";
const SYSTEM_UID = "DOGLY_SYSTEM";

// ── Welcome messages per language ─────────────────────────────────────────────

// Owner welcome (default — finds trainers/caretakers)
const WELCOME_MESSAGES: Record<string, string> = {
  es: `🐾 ¡Bienvenido/a a Dogly Train!\n\nAquí puedes conectar con profesionales para tu perro.\n\n✅ Encuentra entrenadores y cuidadores cerca de ti\n⭐ Lee reseñas de otros dueños\n💬 Contacta directamente por chat\n🎓 Accede a cursos de entrenamiento\n\n¡Comienza explorando la pantalla de Inicio! 🚀`,
  en: `🐾 Welcome to Dogly Train!\n\nHere you can connect with professionals for your dog.\n\n✅ Find trainers and caretakers near you\n⭐ Read reviews from other owners\n💬 Contact them directly via chat\n🎓 Access training courses\n\nStart by exploring the Home screen! 🚀`,
  fr: `🐾 Bienvenue sur Dogly Train !\n\nConnectez-vous avec des professionnels pour votre chien.\n\n✅ Trouvez des dresseurs et pet sitters près de chez vous\n⭐ Lisez les avis d'autres propriétaires\n💬 Contactez-les directement par chat\n🎓 Accédez aux cours de dressage\n\nCommencez par explorer l'écran d'accueil ! 🚀`,
  pt: `🐾 Bem-vindo(a) ao Dogly Train!\n\nAqui você pode conectar com profissionais para o seu cão.\n\n✅ Encontre treinadores e cuidadores perto de você\n⭐ Leia avaliações de outros donos\n💬 Contate-os diretamente pelo chat\n🎓 Acesse cursos de treinamento\n\nComece explorando a tela Início! 🚀`,
  de: `🐾 Willkommen bei Dogly Train!\n\nHier kannst du Profis für deinen Hund finden.\n\n✅ Trainer und Hundesitter in deiner Nähe finden\n⭐ Bewertungen anderer Besitzer lesen\n💬 Direkt per Chat kontaktieren\n🎓 Auf Trainingskurse zugreifen\n\nStarte mit dem Erkunden des Startbildschirms! 🚀`,
};

// Trainer welcome (oriented to providing services)
const WELCOME_MESSAGES_TRAINER: Record<string, string> = {
  es: `🎓 ¡Bienvenido/a a Dogly Train!\n\nGracias por unirte como entrenador profesional.\n\n📝 Completa tu perfil para que los dueños puedan encontrarte\n⏳ Tu cuenta está pendiente de aprobación por nuestro equipo\n💬 Una vez aprobada, recibirás solicitudes por chat\n⚡ Usa el sistema de boost para destacar tu perfil\n\n¡Bienvenido al equipo! 🚀`,
  en: `🎓 Welcome to Dogly Train!\n\nThank you for joining as a professional trainer.\n\n📝 Complete your profile so owners can find you\n⏳ Your account is pending admin approval\n💬 Once approved, you'll receive requests via chat\n⚡ Use the boost system to highlight your profile\n\nWelcome aboard! 🚀`,
  fr: `🎓 Bienvenue sur Dogly Train !\n\nMerci de nous rejoindre en tant qu'éducateur professionnel.\n\n📝 Complétez votre profil pour que les propriétaires puissent vous trouver\n⏳ Votre compte est en attente d'approbation\n💬 Une fois approuvé, vous recevrez des demandes via le chat\n⚡ Utilisez le système de boost pour mettre en avant votre profil\n\nBienvenue dans l'équipe ! 🚀`,
  pt: `🎓 Bem-vindo(a) ao Dogly Train!\n\nObrigado por se juntar como treinador profissional.\n\n📝 Complete seu perfil para que os donos possam te encontrar\n⏳ Sua conta está pendente de aprovação\n💬 Após aprovada, você receberá solicitações por chat\n⚡ Use o sistema de destaque para destacar seu perfil\n\nBem-vindo ao time! 🚀`,
  de: `🎓 Willkommen bei Dogly Train!\n\nDanke, dass du als professioneller Trainer beitrittst.\n\n📝 Vervollständige dein Profil, damit Besitzer dich finden können\n⏳ Dein Konto wartet auf Genehmigung durch unser Team\n💬 Nach Genehmigung erhältst du Anfragen per Chat\n⚡ Nutze das Boost-System, um dein Profil hervorzuheben\n\nWillkommen im Team! 🚀`,
};

// Caretaker welcome (oriented to providing care services)
const WELCOME_MESSAGES_CARETAKER: Record<string, string> = {
  es: `🏠 ¡Bienvenido/a a Dogly Train!\n\nGracias por unirte como cuidador.\n\n📝 Completa tu perfil con tus servicios y tarifas\n⏳ Tu cuenta está pendiente de aprobación por nuestro equipo\n💬 Una vez aprobada, los dueños podrán contactarte\n⚡ Usa el sistema de boost para aparecer en los primeros resultados\n\n¡Bienvenido al equipo! 🚀`,
  en: `🏠 Welcome to Dogly Train!\n\nThank you for joining as a caretaker.\n\n📝 Complete your profile with your services and pricing\n⏳ Your account is pending admin approval\n💬 Once approved, owners will be able to contact you\n⚡ Use the boost system to appear at the top of search results\n\nWelcome aboard! 🚀`,
  fr: `🏠 Bienvenue sur Dogly Train !\n\nMerci de nous rejoindre en tant que pet sitter.\n\n📝 Complétez votre profil avec vos services et tarifs\n⏳ Votre compte est en attente d'approbation\n💬 Une fois approuvé, les propriétaires pourront vous contacter\n⚡ Utilisez le système de boost pour apparaître en haut des résultats\n\nBienvenue dans l'équipe ! 🚀`,
  pt: `🏠 Bem-vindo(a) ao Dogly Train!\n\nObrigado por se juntar como cuidador.\n\n📝 Complete seu perfil com seus serviços e tarifas\n⏳ Sua conta está pendente de aprovação\n💬 Após aprovada, os donos poderão contatar você\n⚡ Use o sistema de destaque para aparecer no topo dos resultados\n\nBem-vindo ao time! 🚀`,
  de: `🏠 Willkommen bei Dogly Train!\n\nDanke, dass du als Hundesitter beitrittst.\n\n📝 Vervollständige dein Profil mit Diensten und Preisen\n⏳ Dein Konto wartet auf Genehmigung durch unser Team\n💬 Nach Genehmigung können Besitzer dich kontaktieren\n⚡ Nutze das Boost-System, um oben in den Suchergebnissen zu erscheinen\n\nWillkommen im Team! 🚀`,
};

const MAX_MESSAGE_LENGTH = 5000;
// Broadcast cooldown: minimum seconds between broadcasts (prevents spam)
const BROADCAST_COOLDOWN_SECS = 300; // 5 minutes

// ── Push notification helper ──────────────────────────────────────────────────

/** Result statuses logged to push_log so the admin dashboard can show
 *  per-day delivery rate. Always-fire-and-forget — never blocks the caller. */
type PushLogStatus = "sent" | "no_token" | "invalid_token" | "error";

async function logPushAttempt(entry: {
  recipientUid: string | null;
  type: string;
  status: PushLogStatus;
  errorMsg?: string | null;
}): Promise<void> {
  try {
    await db.collection("push_log").add({
      recipientUid: entry.recipientUid,
      type: entry.type,
      status: entry.status,
      errorMsg: entry.errorMsg ?? null,
      // Local-day key for cheap aggregation queries.
      day: new Date().toISOString().split("T")[0],
      createdAt: admin.firestore.Timestamp.now(),
    });
  } catch {
    // Never throw — logging must not break the push flow.
  }
}

export async function sendPush(
  fcmToken: string,
  title: string,
  body: string,
  data?: Record<string, string>,
  recipientUid?: string
) {
  const pushType = data?.type ?? "generic";

  if (!fcmToken) {
    await logPushAttempt({
      recipientUid: recipientUid ?? null,
      type: pushType,
      status: "no_token",
    });
    return;
  }

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: fcmToken,
        title,
        body: body.length > 100 ? body.slice(0, 97) + "..." : body,
        data: data ?? {},
        sound: "default",
        priority: "high",
      }),
    });
    const result = await response.json() as any;

    // Token is dead (uninstalled, logged out, etc.) — clean it from the user
    // doc so the next push attempt for this user can be skipped fast.
    if (result?.data?.status === "DeviceNotRegistered") {
      if (recipientUid) {
        functions.logger.warn("Invalid FCM token, removing from user", { recipientUid });
        await db.collection("users").doc(recipientUid).update({
          fcmToken: admin.firestore.FieldValue.delete(),
        });
      }
      await logPushAttempt({
        recipientUid: recipientUid ?? null,
        type: pushType,
        status: "invalid_token",
        errorMsg: "DeviceNotRegistered",
      });
      return;
    }

    // Any other non-ok status returned by Expo → log as error
    if (result?.data?.status && result.data.status !== "ok") {
      await logPushAttempt({
        recipientUid: recipientUid ?? null,
        type: pushType,
        status: "error",
        errorMsg: String(result.data.status),
      });
      return;
    }

    await logPushAttempt({
      recipientUid: recipientUid ?? null,
      type: pushType,
      status: "sent",
    });
  } catch (err: any) {
    functions.logger.warn("Push notification failed", err);
    await logPushAttempt({
      recipientUid: recipientUid ?? null,
      type: pushType,
      status: "error",
      errorMsg: err?.message?.slice(0, 200) ?? "unknown",
    });
  }
}

// ── System chat helper ────────────────────────────────────────────────────────

export async function sendSystemMessage(userId: string, text: string) {
  // Deterministic system chat ID: sorted [SYSTEM_UID, userId]
  const chatId = [SYSTEM_UID, userId].sort().join("_");
  const chatRef = db.collection("chats").doc(chatId);
  const now = admin.firestore.Timestamp.now();

  // Single set+merge with the increment baked in. Avoids the previous
  // non-atomic split where a crash between set() and update() would leave
  // the chat created but unreadCount at zero (badge would never show).
  await chatRef.set({
    participants: [SYSTEM_UID, userId],
    participantNames: { [SYSTEM_UID]: "Dogly Train", [userId]: "" },
    participantPhotos: { [SYSTEM_UID]: null, [userId]: null },
    lastMessage: text,
    lastMessageAt: now,
    lastMessageBy: SYSTEM_UID,
    isSystemChat: true,
    createdAt: now,
    [`unreadCounts.${userId}`]: admin.firestore.FieldValue.increment(1),
  }, { merge: true });

  await db.collection("messages").add({
    chatId,
    senderId: SYSTEM_UID,
    text,
    type: "text",
    createdAt: now,
  });

  return chatId;
}

// ── 1. Push notification on new message ──────────────────────────────────────

/**
 * Triggered when a new message is created in /messages.
 * Sends a push notification to the recipient via Expo Push API.
 */
export const onNewMessage = functions.firestore
  .document("messages/{messageId}")
  .onCreate(async (snap) => {
    const message = snap.data();
    const { chatId, senderId, text, type } = message;

    if (!chatId || !senderId) return;
    if (senderId === SYSTEM_UID) return; // system messages handled separately

    // Build notification body — text for text messages, label for media
    const typeLabels: Record<string, string> = {
      image: "📷 Photo",
      file: "📄 File",
      audio: "🎤 Voice message",
    };
    const pushBody: string = (type && type !== "text")
      ? (typeLabels[type] ?? "New message")
      : (text ?? "");
    if (!pushBody) return;

    const chatDoc = await db.collection("chats").doc(chatId).get();
    if (!chatDoc.exists) return;

    const { participants, participantNames } = chatDoc.data()!;
    // Defensive: a malformed/legacy chat doc without a participants array would
    // make `.find` throw. Since this is an at-least-once trigger, the throw
    // would retry forever on the same bad doc. Bail cleanly instead.
    if (!Array.isArray(participants)) {
      functions.logger.warn("onNewMessage: chat missing participants array", { chatId });
      return;
    }
    const recipientId = participants.find((id: string) => id !== senderId);
    if (!recipientId || recipientId === SYSTEM_UID) return;

    const recipientDoc = await db.collection("users").doc(recipientId).get();
    if (!recipientDoc.exists) return;

    const { fcmToken, status } = recipientDoc.data()!;
    if (!fcmToken || status !== "active") return;

    const senderName = participantNames?.[senderId] ?? "Someone";
    await sendPush(fcmToken, senderName, pushBody, { chatId, senderId }, recipientId);

    functions.logger.info("Push notification sent", { recipientId, chatId });
  });

// ── 2. Welcome message on user creation ──────────────────────────────────────

/**
 * Triggered when a new user document is created in /users.
 * Sends a welcome message in the user's chosen language.
 */
export const onUserCreate = functions.firestore
  .document("users/{userId}")
  .onCreate(async (snap) => {
    const userId = snap.id;
    const userData = snap.data();
    const language: string = userData?.language ?? "es";
    const role: string = userData?.role ?? "owner";

    const messageMap =
      role === "trainer" ? WELCOME_MESSAGES_TRAINER
      : role === "caretaker" ? WELCOME_MESSAGES_CARETAKER
      : WELCOME_MESSAGES;
    const welcomeText = messageMap[language] ?? messageMap["es"];

    try {
      await sendSystemMessage(userId, welcomeText);
      functions.logger.info("Welcome message sent", { userId, language });
    } catch (err) {
      functions.logger.error("Failed to send welcome message", { userId, err });
    }
  });

// ── 3. Admin broadcast ────────────────────────────────────────────────────────

type Audience = "all" | "owners" | "trainers" | "caretakers";

/**
 * HTTP endpoint — admin only. Sends a message to all users (or a filtered
 * subset) via their system chat. Migrated from onCall to onRequest for
 * consistency with the rest of the codebase — the client now uses the
 * shared `callCF` helper instead of `httpsCallable`.
 */
export const sendBroadcastMessage = functions.https.onRequest(async (req, res) => {
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

  const { message, audience } = (req.body ?? {}) as { message?: string; audience?: Audience };

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }
  const trimmed = message.trim();
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }
  if (!audience || !["all", "owners", "trainers", "caretakers"].includes(audience)) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }

  // Rate limiting inside a Firestore transaction — atomic read+write prevents
  // two simultaneous admin broadcasts from both passing the cooldown check.
  const metaRef = db.collection("admin_meta").doc("broadcast");
  let cooldownRemaining = 0;
  await db.runTransaction(async (tx) => {
    const metaSnap = await tx.get(metaRef);
    if (metaSnap.exists) {
      const lastAt: admin.firestore.Timestamp = metaSnap.data()?.lastBroadcastAt;
      if (lastAt) {
        const secondsElapsed = (Date.now() / 1000) - lastAt.seconds;
        if (secondsElapsed < BROADCAST_COOLDOWN_SECS) {
          cooldownRemaining = Math.ceil(BROADCAST_COOLDOWN_SECS - secondsElapsed);
          return; // abort write — cooldown still active
        }
      }
    }
    tx.set(metaRef, { lastBroadcastAt: admin.firestore.Timestamp.now() }, { merge: true });
  });
  if (cooldownRemaining > 0) {
    res.status(429).json({ error: "rate_limited", cooldownRemaining });
    return;
  }

  // Query users
  let usersQuery: admin.firestore.Query = db
    .collection("users")
    .where("status", "==", "active");

  if (audience === "owners") {
    usersQuery = usersQuery.where("role", "==", "owner");
  } else if (audience === "trainers") {
    usersQuery = usersQuery.where("role", "==", "trainer");
  } else if (audience === "caretakers") {
    usersQuery = usersQuery.where("role", "==", "caretaker");
  }

  let sent = 0;
  let failed = 0;
  const PAGE_SIZE = 500;
  let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;

  // Cursor-based pagination to avoid loading all users into memory
    while (true) {
      let pageQuery = usersQuery.limit(PAGE_SIZE);
      if (lastDoc) pageQuery = pageQuery.startAfter(lastDoc);

      const pageSnap = await pageQuery.get();
      if (pageSnap.empty) break;

      lastDoc = pageSnap.docs[pageSnap.docs.length - 1];

      // Process page in chunks of 50
      const chunkSize = 50;
      const docs = pageSnap.docs;
      for (let i = 0; i < docs.length; i += chunkSize) {
        const chunk = docs.slice(i, i + chunkSize);
        const results = await Promise.allSettled(
          chunk.map(async (userDoc) => {
            await sendSystemMessage(userDoc.id, trimmed);
            const { fcmToken } = userDoc.data();
            if (fcmToken) {
              await sendPush(fcmToken, "Dogly Train", trimmed, { type: "broadcast" }, userDoc.id);
            }
          })
        );
        results.forEach((r, idx) => {
          if (r.status === "fulfilled") {
            sent++;
          } else {
            failed++;
            functions.logger.warn("Broadcast failed for user", {
              userId: chunk[idx].id,
              reason: r.reason,
            });
          }
        });
      }

      if (pageSnap.docs.length < PAGE_SIZE) break;
    }

  functions.logger.info("Broadcast sent", { audience, sent, failed });
  res.status(200).json({ sent, failed });
});
