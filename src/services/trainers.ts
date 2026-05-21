import {
  doc,
  updateDoc,
  Timestamp,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  limit,
} from 'firebase/firestore';
import {
  geohashQueryBounds,
  distanceBetween,
} from 'geofire-common';
import { db } from '../config/firebase';
import { TrainerProfile } from '../types';

// --- Update ---

export interface UpdateTrainerProfileData {
  displayName?: string;
  photoURL?: string | null;
  bio?: string;
  experience?: string;
  certifications?: string[];
  pricePerSession?: number;
  currency?: string;
  specialties?: string[];
  city?: string;
  latitude?: number;
  longitude?: number;
  geoHash?: string;
}

export async function updateTrainerProfile(
  userId: string,
  data: UpdateTrainerProfileData
): Promise<void> {
  await updateDoc(doc(db, 'users', userId), {
    ...data,
    updatedAt: Timestamp.now(),
  });
}

// --- Search ---

export interface TrainerSearchResult extends TrainerProfile {
  distanceKm: number;
}

export interface TrainerFilters {
  radiusKm: number;          // 0 = no limit (show all)
  minRating: number;         // 0–5, 0 = any
  maxPrice: number;          // 0 = any
  specialty: string;         // '' = any
  /** Show only trainers with admin-approved identity verification. */
  verifiedOnly?: boolean;
}

export const DEFAULT_FILTERS: TrainerFilters = {
  radiusKm: 0,
  minRating: 0,
  maxPrice: 0,
  specialty: '',
  verifiedOnly: false,
};

/**
 * Fetch all active trainers, optionally filtered.
 * When radiusKm > 0 and center is provided, uses GeoHash bounds.
 * Otherwise fetches all active trainers globally.
 * Results sorted: boosted → rating → distance
 */
export async function searchTrainers(
  center: [number, number] | null,
  filters: TrainerFilters = DEFAULT_FILTERS
): Promise<TrainerSearchResult[]> {
  const now = new Date();
  const seen = new Set<string>();
  const results: TrainerSearchResult[] = [];

  const useGeo = filters.radiusKm > 0 && center !== null;

  if (useGeo && center) {
    // GeoHash query within radius. Marketplace visibility requires BOTH
    // `isActive` (admin moderation) AND `verified` (ID document approved).
    // Defense in depth alongside the rules constraint that `isActive=true`
    // implies `verified=true`.
    const radiusM = filters.radiusKm * 1000;
    const bounds = geohashQueryBounds(center, radiusM);
    const snapshots = await Promise.all(
      bounds.map(([start, end]) =>
        getDocs(query(
          collection(db, 'users'),
          where('role', '==', 'trainer'),
          where('isActive', '==', true),
          where('verified', '==', true),
          where('geoHash', '>=', start),
          where('geoHash', '<=', end)
        ))
      )
    );
    for (const snapshot of snapshots) {
      for (const docSnap of snapshot.docs) {
        if (seen.has(docSnap.id)) continue;
        seen.add(docSnap.id);
        const data = { id: docSnap.id, ...docSnap.data() } as TrainerProfile;
        const distanceKm = distanceBetween([data.latitude, data.longitude], center);
        // Skip providers with missing/invalid coords — distanceBetween can
        // return NaN/Infinity if lat/lng are 0/null, which would otherwise
        // poison the radius filter (NaN > x is false, so they'd leak in).
        if (!isFinite(distanceKm)) continue;
        if (distanceKm > filters.radiusKm) continue;
        results.push({ ...data, distanceKm });
      }
    }
  } else {
    // Global query — verified+active trainers, capped to prevent OOM.
    // 50 is the conservative default; encourage geo-search via location
    // permission in the UI. Pagination deferred to Iter 9.7.
    const snap = await getDocs(
      query(
        collection(db, 'users'),
        where('role', '==', 'trainer'),
        where('isActive', '==', true),
        where('verified', '==', true),
        limit(50)
      )
    );
    for (const docSnap of snap.docs) {
      if (seen.has(docSnap.id)) continue;
      seen.add(docSnap.id);
      const data = { id: docSnap.id, ...docSnap.data() } as TrainerProfile;
      const distanceKm = center
        ? distanceBetween([data.latitude, data.longitude], center)
        : 0;
      if (!isFinite(distanceKm)) continue;
      results.push({ ...data, distanceKm });
    }
  }

  // Apply client-side filters
  const filtered = results.filter((t) => {
    if (filters.minRating > 0 && t.averageRating < filters.minRating) return false;
    if (filters.maxPrice > 0 && t.pricePerSession > filters.maxPrice) return false;
    if (filters.specialty && !t.specialties.some(
      (s) => s.toLowerCase().includes(filters.specialty.toLowerCase())
    )) return false;
    if (filters.verifiedOnly && !t.verified) return false;
    return true;
  });

  // Sort: boosted → rating → distance
  filtered.sort((a, b) => {
    const toDate = (t: any): Date | null => t && typeof t.toDate === 'function' ? t.toDate() : null;
    const aBoosted = (toDate(a.boostedUntil) ?? 0) > now ? 1 : 0;
    const bBoosted = (toDate(b.boostedUntil) ?? 0) > now ? 1 : 0;
    if (bBoosted !== aBoosted) return bBoosted - aBoosted;
    if (b.averageRating !== a.averageRating) return b.averageRating - a.averageRating;
    return a.distanceKm - b.distanceKm;
  });

  return filtered;
}

/**
 * Get a single trainer by ID
 */
export async function getTrainerById(id: string): Promise<TrainerProfile | null> {
  const docSnap = await getDoc(doc(db, 'users', id));
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as TrainerProfile;
}
