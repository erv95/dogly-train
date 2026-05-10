import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { DogWalk, RoutePoint, WalkEnergy, WalkWeather } from '../types';

const COLLECTION = 'dog_walks';

// ── Date helpers ─────────────────────────────────────────────────────────────

/** ISO YYYY-MM-DD in UTC. Same convention used by dogStats streaks and weights. */
function toUtcDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function startOfWeekUtc(now: Date): Date {
  // Monday-based week (matches typical European user expectation).
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay();           // 0 = Sun, 1 = Mon
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export interface CreateWalkInput {
  userId: string;
  dogId: string;
  startedAt: Date;
  durationMinutes: number;
  distanceKm?: number;
  weather?: WalkWeather;
  energy?: WalkEnergy;
  notes?: string;
}

export async function createWalk(input: CreateWalkInput): Promise<string> {
  if (input.durationMinutes <= 0 || input.durationMinutes > 600) {
    throw new Error('Walk duration must be between 1 and 600 minutes');
  }
  if (input.distanceKm !== undefined && (input.distanceKm < 0 || input.distanceKm > 100)) {
    throw new Error('Walk distance must be between 0 and 100 km');
  }

  const data: Omit<DogWalk, 'id'> = {
    userId: input.userId,
    dogId: input.dogId,
    date: toUtcDateStr(input.startedAt),
    startedAt: Timestamp.fromDate(input.startedAt),
    durationMinutes: Math.round(input.durationMinutes),
    ...(input.distanceKm !== undefined ? { distanceKm: Math.round(input.distanceKm * 100) / 100 } : {}),
    ...(input.weather ? { weather: input.weather } : {}),
    ...(input.energy ? { energy: input.energy } : {}),
    ...(input.notes ? { notes: input.notes.slice(0, 280) } : {}),
    createdAt: Timestamp.now(),
  };
  const ref = await addDoc(collection(db, COLLECTION), data);
  return ref.id;
}

export async function deleteWalk(walkId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, walkId));
}

// ── GPS tracking helpers ──────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371;
const ROUTE_MAX_POINTS = 1000;
const MIN_POINT_DISTANCE_M = 8;  // skip GPS jitter under ~8 m

/** Haversine distance in km between two GPS points. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Total distance walking the polyline of points. Returns km. */
export function routeDistanceKm(points: RoutePoint[]): number {
  let km = 0;
  for (let i = 1; i < points.length; i++) {
    km += haversineKm(points[i - 1], points[i]);
  }
  return km;
}

/** Reduce a noisy GPS trace: drop consecutive points closer than the jitter
 *  threshold, then evenly-sample down to `maxPoints` if still too dense.
 *  Keeps the first and last point intact. */
export function compactRoute(points: RoutePoint[], maxPoints: number = ROUTE_MAX_POINTS): RoutePoint[] {
  if (points.length <= 2) return points.slice();
  const minKm = MIN_POINT_DISTANCE_M / 1000;
  const filtered: RoutePoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    if (haversineKm(filtered[filtered.length - 1], points[i]) >= minKm) {
      filtered.push(points[i]);
    }
  }
  filtered.push(points[points.length - 1]);

  if (filtered.length <= maxPoints) return filtered;
  // Evenly sample, always keeping first and last
  const step = (filtered.length - 1) / (maxPoints - 1);
  const sampled: RoutePoint[] = [];
  for (let i = 0; i < maxPoints; i++) {
    sampled.push(filtered[Math.round(i * step)]);
  }
  return sampled;
}

export interface CreateTrackedWalkInput {
  userId: string;
  dogId: string;
  startedAt: Date;
  durationMinutes: number;
  points: RoutePoint[];
  weather?: WalkWeather;
  energy?: WalkEnergy;
  notes?: string;
}

/** Persist a walk captured by the live GPS tracker. Computes distance + pace
 *  from the route and stores the (compacted) point array. */
export async function createTrackedWalk(input: CreateTrackedWalkInput): Promise<string> {
  if (input.durationMinutes <= 0) throw new Error('Walk duration must be positive');

  const compact = compactRoute(input.points);
  const distanceKm = Math.round(routeDistanceKm(compact) * 100) / 100;
  const paceMinPerKm = distanceKm > 0
    ? Math.round((input.durationMinutes / distanceKm) * 10) / 10
    : undefined;

  const data: Omit<DogWalk, 'id'> = {
    userId: input.userId,
    dogId: input.dogId,
    date: toUtcDateStr(input.startedAt),
    startedAt: Timestamp.fromDate(input.startedAt),
    durationMinutes: Math.round(input.durationMinutes),
    distanceKm,
    ...(paceMinPerKm !== undefined ? { paceMinPerKm } : {}),
    ...(input.weather ? { weather: input.weather } : {}),
    ...(input.energy ? { energy: input.energy } : {}),
    ...(input.notes ? { notes: input.notes.slice(0, 280) } : {}),
    route: compact,
    trackedByGps: true,
    createdAt: Timestamp.now(),
  };
  const ref = await addDoc(collection(db, COLLECTION), data);
  return ref.id;
}

export async function getWalk(walkId: string): Promise<DogWalk | null> {
  const snap = await getDoc(doc(db, COLLECTION, walkId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as DogWalk;
}

/**
 * Recent walks for a dog. Capped at `maxResults` (default 50).
 * Includes userId filter to satisfy Firestore security rules.
 */
export async function getDogWalks(
  dogId: string,
  userId: string,
  maxResults: number = 50,
): Promise<DogWalk[]> {
  const q = query(
    collection(db, COLLECTION),
    where('userId', '==', userId),
    where('dogId', '==', dogId),
    orderBy('startedAt', 'desc'),
    limit(maxResults),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as DogWalk));
}

// ── Stats ────────────────────────────────────────────────────────────────────

export interface WeekStats {
  totalWalks: number;
  totalMinutes: number;
  totalKm: number;
  daysActive: number;        // distinct days with at least one walk this week
  longestWalkMinutes: number;
}

/** Pure: aggregate the given walks within the current ISO week (Mon-Sun, UTC). */
export function computeWeekStats(walks: DogWalk[], now: Date = new Date()): WeekStats {
  const weekStart = startOfWeekUtc(now);
  const weekStartMs = weekStart.getTime();

  const inWeek = walks.filter((w) => w.startedAt.toMillis() >= weekStartMs);

  const totalWalks = inWeek.length;
  const totalMinutes = inWeek.reduce((s, w) => s + (w.durationMinutes || 0), 0);
  const totalKm = inWeek.reduce((s, w) => s + (w.distanceKm || 0), 0);
  const daysActive = new Set(inWeek.map((w) => w.date)).size;
  const longestWalkMinutes = inWeek.reduce((m, w) => Math.max(m, w.durationMinutes || 0), 0);

  return {
    totalWalks,
    totalMinutes,
    totalKm: Math.round(totalKm * 100) / 100,
    daysActive,
    longestWalkMinutes,
  };
}

/** Returns the YYYY-MM-DD of the most recent walk, or null. */
export function lastWalkDate(walks: DogWalk[]): string | null {
  if (walks.length === 0) return null;
  // walks are sorted desc by startedAt
  return walks[0].date;
}

/** True if any walk happened today (UTC). */
export function hasWalkedToday(walks: DogWalk[], now: Date = new Date()): boolean {
  const today = toUtcDateStr(now);
  return walks.some((w) => w.date === today);
}
