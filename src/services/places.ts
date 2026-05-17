import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  Timestamp,
  type QueryDocumentSnapshot,
  type DocumentData,
  type QueryConstraint,
} from 'firebase/firestore';
import {
  geohashForLocation,
  geohashQueryBounds,
  distanceBetween,
} from 'geofire-common';
import { db } from '../config/firebase';
import {
  Place,
  PlaceCategory,
  PlaceAmenity,
  PlaceStatus,
  PlaceRating,
} from '../types';

const COLLECTION = 'places';

const NAME_MAX = 120;
const DESC_MAX = 500;
const ADDRESS_MAX = 200;
const CITY_MAX = 80;
const COUNTRY_MAX = 60;
const URL_MAX = 200;
const PHONE_MAX = 30;
const COMMENT_MAX = 500;

const DEFAULT_RADIUS_KM = 25;
const DEFAULT_PAGE_SIZE = 30;

// ── Helpers ──────────────────────────────────────────────────────────────────

function clip(s: string | undefined, max: number): string | undefined {
  if (s === undefined) return undefined;
  const v = s.trim();
  if (!v) return undefined;
  return v.slice(0, max);
}

// ── Search ───────────────────────────────────────────────────────────────────

export interface PlaceSearchFilters {
  /** Center coordinates (latitude, longitude) for geo search. */
  center: [number, number] | null;
  radiusKm?: number;
  category?: PlaceCategory | 'all';
}

export interface PlaceSearchResult extends Place {
  distanceKm: number;
}

/**
 * Search approved places near a center coordinate, optionally filtered by
 * category. Uses GeoHash bounds (same pattern as searchTrainers/searchCaretakers)
 * + final client-side haversine clip.
 *
 * If `center` is null, returns the most recent approved places without
 * geo-filtering — useful as a fallback when location permission denied.
 */
export async function searchPlaces(filters: PlaceSearchFilters): Promise<PlaceSearchResult[]> {
  const radiusKm = filters.radiusKm ?? DEFAULT_RADIUS_KM;
  const radiusM = radiusKm * 1000;
  const cat = filters.category ?? 'all';

  // No center provided → fall back to recent approved listing
  if (!filters.center) {
    const constraints = [
      where('status', '==', 'approved'),
      ...(cat !== 'all' ? [where('category', '==', cat)] : []),
      orderBy('createdAt', 'desc'),
      limit(DEFAULT_PAGE_SIZE),
    ] as const;
    const snap = await getDocs(query(collection(db, COLLECTION), ...constraints));
    return snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<Place, 'id'>),
      distanceKm: 0,
    }));
  }

  const [lat, lon] = filters.center;
  const bounds = geohashQueryBounds([lat, lon], radiusM);

  // Run all GeoHash bound queries in parallel
  const promises = bounds.map(([start, end]) => {
    const constraints = [
      where('status', '==', 'approved'),
      ...(cat !== 'all' ? [where('category', '==', cat)] : []),
      orderBy('geoHash'),
      where('geoHash', '>=', start),
      where('geoHash', '<=', end),
    ];
    return getDocs(query(collection(db, COLLECTION), ...constraints));
  });
  const snaps = await Promise.all(promises);

  // Merge + dedupe + haversine clip + sort by distance
  const seen = new Set<string>();
  const out: PlaceSearchResult[] = [];
  for (const snap of snaps) {
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      const data = d.data() as Omit<Place, 'id'>;
      const distanceKm = distanceBetween([data.latitude, data.longitude], [lat, lon]);
      if (distanceKm <= radiusKm) {
        out.push({ id: d.id, ...data, distanceKm });
      }
    }
  }
  out.sort((a, b) => a.distanceKm - b.distanceKm);
  return out.slice(0, DEFAULT_PAGE_SIZE);
}

export async function getPlace(id: string): Promise<Place | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Place, 'id'>) };
}

// ── Propose ──────────────────────────────────────────────────────────────────

export interface ProposePlaceInput {
  submittedBy: string;
  name: string;
  category: PlaceCategory;
  description: string;
  latitude: number;
  longitude: number;
  city: string;
  country: string;
  address?: string;
  photoURL?: string;
  websiteURL?: string;
  contactPhone?: string;
  amenities?: PlaceAmenity[];
  eventStartAt?: Date;
  eventEndAt?: Date;
}

/**
 * Submit a new place proposal. Created with `status: 'pending'` so it doesn't
 * show up in public search until an admin approves it.
 */
export async function proposePlace(input: ProposePlaceInput): Promise<string> {
  const name = clip(input.name, NAME_MAX);
  const description = clip(input.description, DESC_MAX);
  const city = clip(input.city, CITY_MAX);
  const country = clip(input.country, COUNTRY_MAX);
  if (!name) throw new Error('Place name is required');
  if (!description) throw new Error('Place description is required');
  if (!city || !country) throw new Error('City and country are required');
  if (
    typeof input.latitude !== 'number' || typeof input.longitude !== 'number'
    || input.latitude < -90 || input.latitude > 90
    || input.longitude < -180 || input.longitude > 180
  ) {
    throw new Error('Invalid coordinates');
  }

  const geoHash = geohashForLocation([input.latitude, input.longitude]);

  const data: Record<string, unknown> = {
    name,
    category: input.category,
    description,
    latitude: input.latitude,
    longitude: input.longitude,
    geoHash,
    city,
    country,
    amenities: input.amenities ?? [],
    averageRating: 0,
    totalRatings: 0,
    status: 'pending' as PlaceStatus,
    submittedBy: input.submittedBy,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  const address = clip(input.address, ADDRESS_MAX);
  if (address) data.address = address;
  if (input.photoURL) data.photoURL = input.photoURL;
  const websiteURL = clip(input.websiteURL, URL_MAX);
  if (websiteURL) data.websiteURL = websiteURL;
  const contactPhone = clip(input.contactPhone, PHONE_MAX);
  if (contactPhone) data.contactPhone = contactPhone;
  if (input.eventStartAt) data.eventStartAt = Timestamp.fromDate(input.eventStartAt);
  if (input.eventEndAt) data.eventEndAt = Timestamp.fromDate(input.eventEndAt);

  const ref = await addDoc(collection(db, COLLECTION), data);
  return ref.id;
}

// ── Admin moderation ─────────────────────────────────────────────────────────

export async function approvePlace(placeId: string, adminUid: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, placeId), {
    status: 'approved' as PlaceStatus,
    approvedBy: adminUid,
    updatedAt: Timestamp.now(),
  });
}

export async function rejectPlace(placeId: string, adminUid: string, reason?: string): Promise<void> {
  const patch: Record<string, unknown> = {
    status: 'rejected' as PlaceStatus,
    approvedBy: adminUid,
    updatedAt: Timestamp.now(),
  };
  if (reason) patch.rejectedReason = reason.slice(0, 200);
  await updateDoc(doc(db, COLLECTION, placeId), patch);
}

export async function deletePlace(placeId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, placeId));
}

/**
 * List places by status — used in admin tab to review pending submissions.
 * Cursor-based pagination.
 */
export async function listPlacesByStatus(
  status: PlaceStatus,
  cursor: QueryDocumentSnapshot<DocumentData> | null = null,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<{ items: Place[]; nextCursor: QueryDocumentSnapshot<DocumentData> | null }> {
  const constraints: QueryConstraint[] = [
    where('status', '==', status),
    orderBy('createdAt', 'desc'),
  ];
  if (cursor) constraints.push(startAfter(cursor));
  constraints.push(limit(pageSize));
  const snap = await getDocs(query(collection(db, COLLECTION), ...constraints));
  return {
    items: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Place, 'id'>) })),
    nextCursor: snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1] : null,
  };
}

// ── Ratings ──────────────────────────────────────────────────────────────────

/**
 * Upsert the user's rating for a place (1 rating per user per place). Only
 * writes the rating subdoc. The parent place's averageRating / totalRatings
 * are recomputed server-side by the `onPlaceRatingWrite` Cloud Function so a
 * client can't forge inflated aggregates.
 */
export async function ratePlace(
  placeId: string,
  userId: string,
  rating: number,
  comment?: string,
): Promise<void> {
  if (rating < 1 || rating > 5) throw new Error('Rating must be 1-5');
  const ratingRef = doc(db, COLLECTION, placeId, 'ratings', userId);
  const trimmed = clip(comment, COMMENT_MAX);

  const existing = await getDoc(ratingRef);
  await setDoc(ratingRef, {
    rating,
    ...(trimmed ? { comment: trimmed } : {}),
    createdAt: existing.exists() ? (existing.data() as PlaceRating).createdAt : Timestamp.now(),
    updatedAt: Timestamp.now(),
  }, { merge: true });
}

export async function getMyRating(placeId: string, userId: string): Promise<PlaceRating | null> {
  const snap = await getDoc(doc(db, COLLECTION, placeId, 'ratings', userId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<PlaceRating, 'id'>) };
}
