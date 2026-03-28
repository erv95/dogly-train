import {
  collection,
  doc,
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
  Timestamp,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Chat, Message } from '../types';

const CHATS = 'chats';
const MESSAGES = 'messages';
const PAGE_SIZE = 30;

// --- Offensive language filter (basic) ---

const BLOCKED_WORDS = [
  // Add offensive words here per language
  'spam', 'scam',
];

export function filterOffensiveText(text: string): string {
  let filtered = text;
  for (const word of BLOCKED_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    filtered = filtered.replace(regex, '***');
  }
  return filtered;
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
  // Check if chat already exists between these two users
  const q = query(
    collection(db, CHATS),
    where('participants', 'array-contains', userId)
  );
  const snapshot = await getDocs(q);

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    if (data.participants.includes(otherUserId)) {
      return { id: docSnap.id, ...data } as Chat;
    }
  }

  // Create new chat
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
    createdAt: Timestamp.now(),
  };

  const docRef = await addDoc(collection(db, CHATS), chatData);
  return { id: docRef.id, ...chatData } as Chat;
}

// --- Get user's chats ---

export async function getUserChats(userId: string): Promise<Chat[]> {
  const q = query(
    collection(db, CHATS),
    where('participants', 'array-contains', userId),
    orderBy('lastMessageAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Chat));
}

// --- Send message ---

export async function sendMessage(
  chatId: string,
  senderId: string,
  text: string
): Promise<Message> {
  const filteredText = filterOffensiveText(text.trim());

  const msgData = {
    chatId,
    senderId,
    text: filteredText,
    createdAt: Timestamp.now(),
  };

  const docRef = await addDoc(collection(db, MESSAGES), msgData);

  // Update chat's last message (denormalized)
  await updateDoc(doc(db, CHATS, chatId), {
    lastMessage: filteredText,
    lastMessageAt: Timestamp.now(),
    lastMessageBy: senderId,
  });

  return { id: docRef.id, ...msgData } as Message;
}

// --- Get messages (paginated) ---

export async function getMessages(
  chatId: string,
  lastDoc?: QueryDocumentSnapshot
): Promise<{ messages: Message[]; lastVisible: QueryDocumentSnapshot | null }> {
  let q = query(
    collection(db, MESSAGES),
    where('chatId', '==', chatId),
    orderBy('createdAt', 'desc'),
    limit(PAGE_SIZE)
  );

  if (lastDoc) {
    q = query(q, startAfter(lastDoc));
  }

  const snapshot = await getDocs(q);
  const messages = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Message));
  const lastVisible = snapshot.docs[snapshot.docs.length - 1] ?? null;

  return { messages, lastVisible };
}

// --- Real-time listener for new messages ---

export function subscribeToMessages(
  chatId: string,
  callback: (messages: Message[]) => void
) {
  const q = query(
    collection(db, MESSAGES),
    where('chatId', '==', chatId),
    orderBy('createdAt', 'desc'),
    limit(PAGE_SIZE)
  );

  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Message));
    callback(messages);
  });
}
