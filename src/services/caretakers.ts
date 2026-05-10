import {
  doc,
  updateDoc,
  Timestamp,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  limit,
} from 'firebase/firestore';
import {
  geohashQueryBounds,
  distanceBetween,
} from 'geofire-common';
import { db } from '../config/firebase';
import { CaretakerProfile, CaretakerService, CaretakerPricing, CaretakerAccountType } from '../types';

// --- Update ---

export interface UpdateCaretakerProfileData {
  displayName?: string;
  photoURL?: string | null;
  accountType?: CaretakerAccountType;
  businessName?: string | null;
  capacity?: number | null;
  bio?: string;
  experience?: string;
  certifications?: string[];
  pricing?: CaretakerPricing;
  currency?: string;
  services?: CaretakerService[];
  city?: string;
  latitude?: number;
  longitude?: number;
  geoHash?: string;
}

/**
 * Validate caretaker data before update.
 * Throws if invalid (matches client-side errors).
 */
function validateCaretakerData(data: UpdateCaretakerProfileData): void {
  if (data.accountType === 'business' && !data.businessName?.trim()) {
    throw new Error('businessNameRequired');
  }
  if (data.services !== undefined && data.services.length === 0) {
    throw new Error('noServicesError');
  }
  // If services provided, ensure each has a price
  if (data.services && data.pricing) {
    const priceKeyMap: Record<CaretakerService, keyof CaretakerPricing> = {
      walks: 'walk',
      day_care: 'dayCare',
      overnight: 'overnight',
      home_care: 'homeCare',
    };
    for (const service of data.services) {
      const priceKey = priceKeyMap[service];
      const price = data.pricing[priceKey];
      if (price === undefined || price === null || price <= 0) {
        throw new Error('noPriceError');
      }
    }
  }
}

export async function updateCaretakerProfile(
  userId: string,
  data: UpdateCaretakerProfileData
): Promise<void> {
  validateCaretakerData(data);
  await updateDoc(doc(db, 'users', userId), {
    ...data,
    updatedAt: Timestamp.now(),
  });
}

// --- Search ---

export interface CaretakerSearchResult extends CaretakerProfile {
  distanceKm: number;
}

export interface CaretakerFilters {
  radiusKm: number;          // 0 = no limit (show all)
  minRating: number;         // 0–5, 0 = any
  maxPrice: number;          // 0 = any (filters by minimum price across selected services)
  service: CaretakerService | '';  // '' = any
  /** Show only caretakers with admin-approved identity verification. */
  verifiedOnly?: boolean;
}

export const DEFAULT_CARETAKER_FILTERS: CaretakerFilters = {
  radiusKm: 0,
  minRating: 0,
  maxPrice: 0,
  service: '',
  verifiedOnly: false,
};

/**
 * Get the lowest price across services offered by a caretaker.
 * Used for sorting and filtering by maxPrice.
 */
export function getMinPrice(c: CaretakerProfile): number {
  const prices: number[] = [];
  if (c.pricing.walk && c.pricing.walk > 0) prices.push(c.pricing.walk);
  if (c.pricing.dayCare && c.pricing.dayCare > 0) prices.push(c.pricing.dayCare);
  if (c.pricing.overnight && c.pricing.overnight > 0) prices.push(c.pricing.overnight);
  if (c.pricing.homeCare && c.pricing.homeCare > 0) prices.push(c.pricing.homeCare);
  return prices.length > 0 ? Math.min(...prices) : 0;
}

/**
 * Fetch active caretakers, optionally filtered by location and other criteria.
 * When radiusKm > 0 and center is provided, uses GeoHash bounds.
 * Otherwise fetches up to 200 active caretakers globally.
 * Results sorted: boosted → rating → distance.
 */
export async function searchCaretakers(
  center: [number, number] | null,
  filters: CaretakerFilters = DEFAULT_CARETAKER_FILTERS
): Promise<CaretakerSearchResult[]> {
  const now = new Date();
  const seen = new Set<string>();
  const results: CaretakerSearchResult[] = [];

  const useGeo = filters.radiusKm > 0 && center !== null;

  if (useGeo && center) {
    const radiusM = filters.radiusKm * 1000;
    const bounds = geohashQueryBounds(center, radiusM);
    const snapshots = await Promise.all(
      bounds.map(([start, end]) =>
        getDocs(query(
          collection(db, 'users'),
          where('role', '==', 'caretaker'),
          where('isActive', '==', true),
          where('geoHash', '>=', start),
          where('geoHash', '<=', end)
        ))
      )
    );
    for (const snapshot of snapshots) {
      for (const docSnap of snapshot.docs) {
        if (seen.has(docSnap.id)) continue;
        seen.add(docSnap.id);
        const data = { id: docSnap.id, ...docSnap.data() } as CaretakerProfile;
        const distanceKm = distanceBetween([data.latitude, data.longitude], center);
        if (distanceKm > filters.radiusKm) continue;
        results.push({ ...data, distanceKm });
      }
    }
  } else {
    // Global query — capped at 200 to prevent OOM
    const snap = await getDocs(
      query(
        collection(db, 'users'),
        where('role', '==', 'caretaker'),
        where('isActive', '==', true),
        limit(200)
      )
    );
    for (const docSnap of snap.docs) {
      if (seen.has(docSnap.id)) continue;
      seen.add(docSnap.id);
      const data = { id: docSnap.id, ...docSnap.data() } as CaretakerProfile;
      const distanceKm = center
        ? distanceBetween([data.latitude, data.longitude], center)
        : 0;
      results.push({ ...data, distanceKm });
    }
  }

  // Apply client-side filters
  const filtered = results.filter((c) => {
    // Must have at least one service defined
    if (!c.services || c.services.length === 0) return false;
    if (filters.minRating > 0 && c.averageRating < filters.minRating) return false;
    if (filters.maxPrice > 0) {
      const minPrice = getMinPrice(c);
      if (minPrice === 0 || minPrice > filters.maxPrice) return false;
    }
    if (filters.service && !c.services.includes(filters.service)) return false;
    if (filters.verifiedOnly && !c.verified) return false;
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
 * Get a single caretaker by ID.
 */
export async function getCaretakerById(id: string): Promise<CaretakerProfile | null> {
  const docSnap = await getDoc(doc(db, 'users', id));
  if (!docSnap.exists()) return null;
  const data = docSnap.data();
  if (data.role !== 'caretaker') return null;
  return { id: docSnap.id, ...data } as CaretakerProfile;
}
