import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { getDogStats, DogStats } from '../services/dogStats';
import { getDogReminders } from '../services/reminders';
import { getDogWalks } from '../services/dogWalks';
import { DogReminder, DogWalk } from '../types';

/**
 * Shared per-dog state for the Hoy tab (Iter 8.7.6 — HIGH-8).
 *
 * Before this context, TodayHero, WeekStrip, NextReminderCard and
 * DailyTipsRail each fetched `getDogStats` / `getDogReminders` / `getDogWalks`
 * independently → ~7 reads per Today open. With the provider centralised at
 * the Hoy screen level, that drops to ~3 per dog switch + 0 on simple
 * re-renders.
 */

interface DogStatsContextValue {
  stats: DogStats | null;
  reminders: DogReminder[];
  walks: DogWalk[];
  loading: boolean;
  partialFailure: boolean;
  refresh: () => Promise<void>;
}

const defaultValue: DogStatsContextValue = {
  stats: null,
  reminders: [],
  walks: [],
  loading: true,
  partialFailure: false,
  refresh: async () => {},
};

const DogStatsContext = createContext<DogStatsContextValue>(defaultValue);

export function DogStatsProvider({
  dogId,
  children,
}: {
  dogId: string | null;
  children: React.ReactNode;
}) {
  const { firebaseUser } = useAuth();
  const [stats, setStats] = useState<DogStats | null>(null);
  const [reminders, setReminders] = useState<DogReminder[]>([]);
  const [walks, setWalks] = useState<DogWalk[]>([]);
  const [loading, setLoading] = useState(true);
  const [partialFailure, setPartialFailure] = useState(false);

  const load = useCallback(async () => {
    if (!firebaseUser || !dogId) {
      setStats(null);
      setReminders([]);
      setWalks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setPartialFailure(false);
    // allSettled so a single failing service doesn't blank the whole tab.
    const [sR, rR, wR] = await Promise.allSettled([
      getDogStats(dogId),
      getDogReminders(dogId, firebaseUser.uid),
      getDogWalks(dogId, firebaseUser.uid, 30),
    ]);
    let anyFailed = false;
    if (sR.status === 'fulfilled') setStats(sR.value); else { setStats(null); anyFailed = true; console.warn('DogStatsContext stats failed:', (sR.reason as any)?.code); }
    if (rR.status === 'fulfilled') setReminders(rR.value); else { setReminders([]); anyFailed = true; console.warn('DogStatsContext reminders failed:', (rR.reason as any)?.code); }
    if (wR.status === 'fulfilled') setWalks(wR.value); else { setWalks([]); anyFailed = true; console.warn('DogStatsContext walks failed:', (wR.reason as any)?.code); }
    setPartialFailure(anyFailed);
    setLoading(false);
  }, [dogId, firebaseUser]);

  useEffect(() => {
    load();
  }, [load]);

  const value = useMemo<DogStatsContextValue>(
    () => ({ stats, reminders, walks, loading, partialFailure, refresh: load }),
    [stats, reminders, walks, loading, partialFailure, load],
  );

  return <DogStatsContext.Provider value={value}>{children}</DogStatsContext.Provider>;
}

export function useDogStats(): DogStatsContextValue {
  return useContext(DogStatsContext);
}
