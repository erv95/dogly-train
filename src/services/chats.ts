import {
  collection,
  doc,
  setDoc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  increment,
  Timestamp,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Chat, Message, MessageType } from '../types';

const CHATS = 'chats';
const MESSAGES = 'messages';
const PAGE_SIZE = 30;

// --- Offensive language filter ---
// Multi-language baseline list. For production-grade moderation, integrate
// a moderation API (Perspective, OpenAI Moderation) — this is best-effort.

const BLOCKED_WORDS = [
  // Spam / scam (multi-lang)
  'spam', 'scam', 'estafa', 'arnaque', 'golpe', 'betrug',
  // English profanity
  'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'dick', 'pussy', 'whore', 'slut', 'faggot', 'nigger', 'retard',
  // Spanish profanity
  'puta', 'puto', 'mierda', 'cabron', 'cabrón', 'pendejo', 'gilipollas', 'coño', 'cono', 'joder', 'maricón', 'maricon',
  // French profanity
  'putain', 'salope', 'connard', 'enculé', 'encule', 'merde', 'pédé', 'pede', 'bite',
  // Portuguese profanity
  'merda', 'caralho', 'porra', 'foda', 'puta', 'cu', 'viado',
  // German profanity
  'scheisse', 'scheiße', 'arschloch', 'fotze', 'hurensohn', 'schwuchtel',
  // Common scam keywords
  'paypal.me', 'bitcoin', 'wire transfer', 'western union', 'send money',
];

// Pre-compile regex once for performance
const BLOCKED_REGEX = new RegExp(
  `\\b(${BLOCKED_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'gi'
);

export function filterOffensiveText(text: string): string {
  return text.replace(BLOCKED_REGEX, '***');
}

// --- Deterministic chat ID: sorted UIDs joined with '_' ---
// Eliminates race condition: two concurrent calls produce the same ID,
// and setDoc with merge:true is idempotent.
function chatDocId(a: string, b: string): string {
  return [a, b].sort().join('_');
}

// --- Get or create chat ---

export async function getOrCreateChat(
  userId: string,
  otherUserId: string,
  userName: string,
  otherUserName: string,
  userPhoto: string | null,
  otherUserPhoto: string | null
): Promise<Chat> {
  const chatId = chatDocId(userId, otherUserId);
  const chatRef = doc(db, CHATS, chatId);
  const existing = await getDoc(chatRef);

  if (existing.exists()) {
    return { id: existing.id, ...existing.data() } as Chat;
  }

  const chatData = {
    participants: [userId, otherUserId],
    participantNames: {
      [userId]: userName,
      [otherUserId]: otherUserName,
    },
    participantPhotos: {
      [userId]: userPhoto,
      [otherUserId]: otherUserPhoto,
    },
    lastMessage: '',
    lastMessageAt: Timestamp.now(),
    lastMessageBy: '',
    unreadCounts: { [userId]: 0, [otherUserId]: 0 },
    createdAt: Timestamp.now(),
  };

  // setDoc is idempotent — concurrent calls with the same ID are safe
  await setDoc(chatRef, chatData, { merge: true });
  return { id: chatId, ...chatData } as Chat;
}

// --- Get user's chats ---

export async function getUserChats(userId: string, maxResults = 100): Promise<Chat[]> {
  const q = query(
    collection(db, CHATS),
    where('participants', 'array-contains', userId),
    orderBy('lastMessageAt', 'desc'),
    limit(maxResults)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Chat));
}

// --- Send message ---

export async function sendMessage(
  chatId: string,
  senderId: string,
  text: string,
  recipientId?: string
): Promise<Message> {
  // Cap to 1000 chars to match the Firestore security rule, otherwise the
  // write fails silently with permission-denied and the user sees no error.
  const trimmed = text.trim().slice(0, 1000);
  const filteredText = filterOffensiveText(trimmed);

  const msgData = {
    chatId,
    senderId,
    text: filteredText,
    type: 'text' as MessageType,
    createdAt: Timestamp.now(),
  };

  const docRef = await addDoc(collection(db, MESSAGES), msgData);

  const chatUpdate: Record<string, any> = {
    lastMessage: filteredText,
    lastMessageAt: Timestamp.now(),
    lastMessageBy: senderId,
  };
  if (recipientId) {
    chatUpdate[`unreadCounts.${recipientId}`] = increment(1);
  }
  await updateDoc(doc(db, CHATS, chatId), chatUpdate);

  return { id: docRef.id, ...msgData } as Message;
}

export async function sendMediaMessage(
  chatId: string,
  senderId: string,
  type: 'image' | 'file' | 'audio',
  mediaURL: string,
  options: {
    fileName?: string;
    mimeType?: string;
    fileSize?: number;
    audioDuration?: number;
  } = {},
  recipientId?: string
): Promise<Message> {
  const previewMap: Record<string, string> = {
    image: '📷 Foto',
    file: `📄 ${options.fileName ?? 'Archivo'}`,
    audio: '🎤 Audio',
  };

  const msgData = {
    chatId,
    senderId,
    text: '',
    type,
    mediaURL,
    ...(options.fileName && { fileName: options.fileName }),
    ...(options.mimeType && { mimeType: options.mimeType }),
    ...(options.fileSize && { fileSize: options.fileSize }),
    ...(options.audioDuration !== undefined && { audioDuration: options.audioDuration }),
    createdAt: Timestamp.now(),
  };

  const docRef = await addDoc(collection(db, MESSAGES), msgData);

  const chatUpdate: Record<string, any> = {
    lastMessage: previewMap[type],
    lastMessageAt: Timestamp.now(),
    lastMessageBy: senderId,
  };
  if (recipientId) {
    chatUpdate[`unreadCounts.${recipientId}`] = increment(1);
  }
  await updateDoc(doc(db, CHATS, chatId), chatUpdate);

  return { id: docRef.id, ...msgData } as Message;
}

// --- Mark chat as read ---

export async function markChatAsRead(chatId: string, userId: string): Promise<void> {
  await updateDoc(doc(db, CHATS, chatId), {
    [`unreadCounts.${userId}`]: 0,
  });
}

// --- Subscribe to total unread count ---

export function subscribeToUnreadCount(
  userId: string,
  callback: (count: number) => void,
  onError?: (err: Error) => void
): () => void {
  // Cap the snapshot to the 50 most recent chats — unread counts older than
  // that are virtually always zero anyway, and an unbounded snapshot was
  // the dominant Firestore read cost for active users.
  const q = query(
    collection(db, CHATS),
    where('participants', 'array-contains', userId),
    orderBy('lastMessageAt', 'desc'),
    limit(50)
  );
  let unsubInternal: (() => void) | null = null;
  unsubInternal = onSnapshot(q,
    (snapshot) => {
      let total = 0;
      snapshot.docs.forEach((d) => {
        total += (d.data().unreadCounts?.[userId] ?? 0);
      });
      callback(total);
    },
    (err) => {
      console.warn('subscribeToUnreadCount error:', err);
      // permission-denied means the user was banned / signed out / deleted.
      // The listener will keep retrying and burning resources unless we
      // explicitly tear it down.
      if ((err as { code?: string }).code === 'permission-denied') {
        unsubInternal?.();
      }
      onError?.(err);
    }
  );
  return () => unsubInternal?.();
}

// --- Get messages (paginated) ---

export async function getMessages(
  chatId: string,
  lastDoc?: QueryDocumentSnapshot
): Promise<{ messages: Message[]; lastVisible: QueryDocumentSnapshot | null }> {
  const constraints: any[] = [
    where('chatId', '==', chatId),
    orderBy('createdAt', 'desc'),
  ];
  if (lastDoc) {
    constraints.push(startAfter(lastDoc));
  }
  constraints.push(limit(PAGE_SIZE));

  const q = query(collection(db, MESSAGES), ...constraints);

  const snapshot = await getDocs(q);
  const messages = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Message));
  const lastVisible = snapshot.docs[snapshot.docs.length - 1] ?? null;

  return { messages, lastVisible };
}

// --- Real-time listener for new messages ---

export function subscribeToMessages(
  chatId: string,
  callback: (messages: Message[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(
    collection(db, MESSAGES),
    where('chatId', '==', chatId),
    orderBy('createdAt', 'desc'),
    limit(PAGE_SIZE)
  );

  return onSnapshot(q,
    (snapshot) => {
      const messages = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Message));
      callback(messages);
    },
    (err) => {
      // Log only code + message to avoid leaking stack traces / internal
      // request metadata to dev consoles or remote log sinks.
      console.error('subscribeToMessages error:', (err as any)?.code, (err as any)?.message);
      onError?.(err);
    }
  );
}
