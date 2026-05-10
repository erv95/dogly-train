import { addDoc, collection, doc, increment, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { compressImage, uploadImage } from '../utils/photo';
import { Message, ServiceReport, ServiceReportCategory, WalkEnergy, WalkWeather } from '../types';

const MESSAGES = 'messages';
const CHATS = 'chats';

const NOTE_MAX = 280;
const PHOTOS_MIN = 1;
const PHOTOS_MAX = 3;

export interface SendServiceReportInput {
  chatId: string;
  senderId: string;
  recipientId?: string;
  category: ServiceReportCategory;
  /** Local URIs from the image picker (1-3) */
  photoUris: string[];
  note: string;
  durationMinutes?: number;
  energy?: WalkEnergy;
  weather?: WalkWeather;
}

/**
 * Compress + upload all selected photos in parallel, then create a single
 * Firestore message of type 'service_report' with structured metadata.
 *
 * Returns the persisted Message including the populated `serviceReport`.
 * Throws if validation fails or any upload errors out (caller should surface).
 */
export async function sendServiceReport(input: SendServiceReportInput): Promise<Message> {
  // ── Validation ─────────────────────────────────────────────────────────────
  if (!input.photoUris.length || input.photoUris.length < PHOTOS_MIN) {
    throw new Error(`At least ${PHOTOS_MIN} photo is required`);
  }
  if (input.photoUris.length > PHOTOS_MAX) {
    throw new Error(`Up to ${PHOTOS_MAX} photos are allowed`);
  }
  const note = (input.note ?? '').trim().slice(0, NOTE_MAX);
  if (!note) throw new Error('Note is required');
  if (input.durationMinutes !== undefined && (input.durationMinutes <= 0 || input.durationMinutes > 720)) {
    throw new Error('Duration must be between 1 and 720 minutes');
  }

  // ── Upload photos in parallel ──────────────────────────────────────────────
  // Compress first (resize 800px wide + JPEG q70) so the chat_media path stays
  // under the 5 MB image limit enforced by Storage rules.
  const stamp = Date.now();
  const photoURLs = await Promise.all(
    input.photoUris.map(async (uri, idx) => {
      const compressed = await compressImage(uri);
      const path = `chat_media/${input.chatId}/${input.senderId}/images/report-${stamp}-${idx}.jpg`;
      return uploadImage(compressed, path);
    }),
  );

  // ── Build the message document ─────────────────────────────────────────────
  const serviceReport: ServiceReport = {
    category: input.category,
    photoURLs,
    note,
    ...(input.durationMinutes !== undefined ? { durationMinutes: Math.round(input.durationMinutes) } : {}),
    ...(input.energy ? { energy: input.energy } : {}),
    ...(input.weather ? { weather: input.weather } : {}),
  };

  const msgData = {
    chatId: input.chatId,
    senderId: input.senderId,
    text: '',
    type: 'service_report' as const,
    // Mirror the first photo into mediaURL so legacy chat-list previews still
    // display a thumbnail even before they understand 'service_report'.
    mediaURL: photoURLs[0],
    serviceReport,
    createdAt: Timestamp.now(),
  };

  const docRef = await addDoc(collection(db, MESSAGES), msgData);

  // Update chat preview + bump unread counter for the recipient
  const chatUpdate: Record<string, any> = {
    lastMessage: '📸 Reporte de servicio',
    lastMessageAt: Timestamp.now(),
    lastMessageBy: input.senderId,
  };
  if (input.recipientId) {
    chatUpdate[`unreadCounts.${input.recipientId}`] = increment(1);
  }
  await updateDoc(doc(db, CHATS, input.chatId), chatUpdate);

  return { id: docRef.id, ...msgData } as Message;
}
