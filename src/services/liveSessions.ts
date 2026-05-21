import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  writeBatch,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as Crypto from 'expo-crypto';
import { auth, db, storage } from '../config/firebase';
import { callCF } from '../utils/cfClient';
import { LivePathPoint, LivePhoto, LiveSession } from '../types';

export async function startLiveSession(bookingId: string): Promise<LiveSession> {
  const data = await callCF<{ session: LiveSession }>('startLiveSession', { bookingId });
  return data.session;
}

export async function endLiveSession(bookingId: string): Promise<void> {
  await callCF('endLiveSession', { bookingId });
}

/**
 * Push a batch of GPS samples to the path sub-collection. Uses the millis-id
 * trick so the docs naturally sort by time without an index. Provider-only —
 * client-side rules are enforced inside startLiveSession (which sets ownerId
 * and providerId on the parent doc).
 *
 * Note: writes go directly to Firestore (not via Cloud Function) for latency.
 * Storage rules guarantee only the provider can write to their own session.
 */
export async function pushLocations(
  bookingId: string,
  points: { lat: number; lng: number; recordedAt: Date }[],
): Promise<void> {
  if (points.length === 0) return;
  const batch = writeBatch(db);
  const sessionRef = doc(db, 'booking_live_sessions', bookingId);
  for (const p of points) {
    const id = String(p.recordedAt.getTime()).padStart(16, '0');
    const pRef = doc(db, 'booking_live_sessions', bookingId, 'path', id);
    batch.set(pRef, {
      lat: p.lat,
      lng: p.lng,
      recordedAt: Timestamp.fromDate(p.recordedAt),
    });
  }
  // Bump lastPing on the parent so the cron knows the session is alive.
  batch.set(sessionRef, { lastPing: serverTimestamp() }, { merge: true });
  await batch.commit();
}

/** Upload a photo and create the photos sub-collection doc. The provider
 *  client takes the photo via expo-image-picker, compresses it, and calls
 *  this. Counts toward the denormalised `photoCount` on the parent. */
export async function uploadLivePhoto(
  bookingId: string,
  uri: string,
  caption?: string,
): Promise<LivePhoto> {
  const u = auth.currentUser;
  if (!u) throw new Error('unauthenticated');
  // Crypto-random suffix prevents enumeration by anyone who knows the
  // bookingId — a 13-digit Date.now() alone is enumerable in ~60k attempts
  // per minute. 12 random bytes = 96 bits of entropy on top of the timestamp.
  const randBytes = await Crypto.getRandomBytesAsync(12);
  const randHex = Array.from(randBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  const photoId = `${Date.now()}_${randHex}`;
  const path = `live-sessions/${bookingId}/${photoId}.jpg`;
  const response = await fetch(uri);
  const blob = await response.blob();
  await uploadBytes(ref(storage, path), blob, { contentType: 'image/jpeg' });
  const url = await getDownloadURL(ref(storage, path));
  const photoRef = doc(db, 'booking_live_sessions', bookingId, 'photos', photoId);
  const sessionRef = doc(db, 'booking_live_sessions', bookingId);
  const batch = writeBatch(db);
  batch.set(photoRef, {
    url,
    caption: caption ?? null,
    takenAt: serverTimestamp(),
  });
  batch.set(sessionRef, {
    lastPing: serverTimestamp(),
    // photoCount can drift in races; the cron / cf can recompute. For UX we
    // bump it optimistically so the owner sees the new count instantly.
  }, { merge: true });
  await batch.commit();
  return { id: photoId, url, caption: caption ?? null, takenAt: Timestamp.now() };
}

/** Subscribe to a live session + its path + photos. Returns a single
 *  unsubscribe that detaches all three listeners. */
export function subscribeToLiveSession(
  bookingId: string,
  cb: (s: { session: LiveSession | null; path: LivePathPoint[]; photos: LivePhoto[] }) => void,
): Unsubscribe {
  let session: LiveSession | null = null;
  let path: LivePathPoint[] = [];
  let photos: LivePhoto[] = [];

  const emit = () => cb({ session, path, photos });

  // Refs in closure scope so onError can tear down all three at once when
  // the user loses access mid-session (booking cancelled, account banned).
  // Without this, permission-denied retries silently forever.
  let unsubSession: Unsubscribe | undefined;
  let unsubPath: Unsubscribe | undefined;
  let unsubPhotos: Unsubscribe | undefined;
  const unsubAll = () => {
    unsubSession?.(); unsubPath?.(); unsubPhotos?.();
    unsubSession = unsubPath = unsubPhotos = undefined;
  };
  const onErr = (label: string) => (err: any) => {
    if (err?.code === 'permission-denied') unsubAll();
    console.warn(`liveSession listener error (${label}):`, err?.code ?? err?.message);
  };

  unsubSession = onSnapshot(
    doc(db, 'booking_live_sessions', bookingId),
    (snap) => {
      session = snap.exists() ? ({ id: snap.id, ...snap.data() } as LiveSession) : null;
      emit();
    },
    onErr('session'),
  );
  unsubPath = onSnapshot(
    query(collection(db, 'booking_live_sessions', bookingId, 'path'), orderBy('recordedAt', 'asc')),
    (snap) => {
      path = snap.docs.map((d) => ({ id: d.id, ...d.data() } as LivePathPoint));
      emit();
    },
    onErr('path'),
  );
  unsubPhotos = onSnapshot(
    query(collection(db, 'booking_live_sessions', bookingId, 'photos'), orderBy('takenAt', 'asc')),
    (snap) => {
      photos = snap.docs.map((d) => ({ id: d.id, ...d.data() } as LivePhoto));
      emit();
    },
    onErr('photos'),
  );

  return unsubAll;
}

export async function getLiveSessionOnce(bookingId: string): Promise<LiveSession | null> {
  const snap = await getDoc(doc(db, 'booking_live_sessions', bookingId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as LiveSession;
}

/** Returns the URL of the most recent live-session photo for a booking, or
 *  null if the session has no photos / doesn't exist. Used by booking
 *  completion flow to reuse an existing photo as proof. */
export async function getLatestLivePhotoUrl(bookingId: string): Promise<string | null> {
  try {
    const snap = await getDocs(query(
      collection(db, 'booking_live_sessions', bookingId, 'photos'),
      orderBy('takenAt', 'desc'),
      limit(1),
    ));
    const first = snap.docs[0];
    if (!first) return null;
    const url = (first.data() as any)?.url;
    return typeof url === 'string' ? url : null;
  } catch {
    return null;
  }
}
