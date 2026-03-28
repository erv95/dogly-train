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

/**
 * Search active trainers within a radius using GeoHash bounds.
 * Results are sorted client-side: boosted > rating > distance
 */
export async function searchTrainers(
  center: [number, number], // [lat, lng]
  radiusKm: number = 50
): Promise<TrainerSearchResult[]> {
  const radiusM = radiusKm * 1000;
  const bounds = geohashQueryBounds(center, radiusM);

  // Fire one query per geohash bound range
  const snapshots = await Promise.all(
    bounds.map(([start, end]) => {
      const q = query(
        collection(db, 'users'),
        where('role', '==', 'trainer'),
        where('isActive', '==', true),
        where('geoHash', '>=', start),
        where('geoHash', '<=', end)
      );
      return getDocs(q);
    })
  );

  const now = new Date();
  const seen = new Set<string>();
  const results: TrainerSearchResult[] = [];

  for (const snapshot of snapshots) {
    for (const docSnap of snapshot.docs) {
      if (seen.has(docSnap.id)) continue;
      seen.add(docSnap.id);

      const data = { id: docSnap.id, ...docSnap.data() } as TrainerProfile;

      // Filter by actual distance (geohash bounds are approximate)
      const distanceKm = distanceBetween(
        [data.latitude, data.longitude],
        center
      );
      if (distanceKm > radiusKm) continue;

      results.push({ ...data, distanceKm });
    }
  }

  // Sort: boosted first, then by rating (desc), then by distance (asc)
  results.sort((a, b) => {
    const aBoosted = a.boostedUntil && (a.boostedUntil as any).toDate() > now ? 1 : 0;
    const bBoosted = b.boostedUntil && (b.boostedUntil as any).toDate() > now ? 1 : 0;
    if (bBoosted !== aBoosted) return bBoosted - aBoosted;
    if (b.averageRating !== a.averageRating) return b.averageRating - a.averageRating;
    return a.distanceKm - b.distanceKm;
  });

  return results;
}

/**
 * Get a single trainer by ID
 */
export async function getTrainerById(id: string): Promise<TrainerProfile | null> {
  const docSnap = await getDoc(doc(db, 'users', id));
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as TrainerProfile;
}
