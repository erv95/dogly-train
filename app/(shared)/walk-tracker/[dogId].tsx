import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import MapView, { Polyline, Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import {
  haversineKm,
  createTrackedWalk,
  routeDistanceKm,
} from '../../../src/services/dogWalks';
import { RoutePoint } from '../../../src/types';
import { useAuth } from '../../../src/contexts/AuthContext';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../../src/theme';

type Status = 'idle' | 'tracking' | 'paused' | 'saving';

const MIN_ACCEPT_M = 5;          // ignore points jumping less than this (jitter)
const ACCURACY_REJECT_M = 50;    // ignore points whose horizontal accuracy is worse than this

export default function WalkTrackerScreen() {
  const { dogId } = useLocalSearchParams<{ dogId: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { firebaseUser } = useAuth();

  const [status, setStatus] = useState<Status>('idle');
  const [points, setPoints] = useState<RoutePoint[]>([]);
  const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number } | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [permError, setPermError] = useState(false);

  const watcherRef = useRef<Location.LocationSubscription | null>(null);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<Date | null>(null);
  // Sum of seconds across previous (paused) segments. Combined with the current
  // segment's running time to get total elapsed. Survives pause/resume cycles.
  const accumulatedSecondsRef = useRef(0);
  const segmentStartRef = useRef<number | null>(null);
  const lastAcceptedPointRef = useRef<RoutePoint | null>(null);

  // Initial location on mount so the map can center
  useEffect(() => {
    (async () => {
      try {
        const { status: perm } = await Location.requestForegroundPermissionsAsync();
        if (perm !== 'granted') { setPermError(true); return; }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
        setCurrentPos({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      } catch {
        setPermError(true);
      }
    })();
    return () => {
      stopWatcher();
      stopTicker();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const distanceKm = useMemo(() => routeDistanceKm(points), [points]);
  const paceMinPerKm = distanceKm > 0 ? (elapsedSeconds / 60) / distanceKm : 0;

  const stopWatcher = () => {
    watcherRef.current?.remove();
    watcherRef.current = null;
  };
  const stopTicker = () => {
    if (tickerRef.current) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
  };

  const handleLocation = (loc: Location.LocationObject) => {
    if ((loc.coords.accuracy ?? 0) > ACCURACY_REJECT_M) return;
    const t0 = startedAtRef.current?.getTime();
    if (!t0) return;

    const point: RoutePoint = {
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      t: Math.round((loc.timestamp - t0) / 1000),
    };
    setCurrentPos({ lat: point.lat, lng: point.lng });

    const last = lastAcceptedPointRef.current;
    if (last) {
      const dKm = haversineKm(last, point);
      if (dKm * 1000 < MIN_ACCEPT_M) return;
    }
    lastAcceptedPointRef.current = point;
    setPoints((prev) => [...prev, point]);
  };

  const startWatcher = async () => {
    stopWatcher();
    const sub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 2000,
        distanceInterval: 5,
      },
      handleLocation,
    );
    watcherRef.current = sub;
  };

  const startTicker = () => {
    stopTicker();
    segmentStartRef.current = Date.now();
    tickerRef.current = setInterval(() => {
      if (segmentStartRef.current == null) return;
      const segment = (Date.now() - segmentStartRef.current) / 1000;
      setElapsedSeconds(accumulatedSecondsRef.current + segment);
    }, 500);
  };

  const handleStart = async () => {
    if (permError) {
      Alert.alert(t('common.error'), t('walkTracker.permissionDenied'));
      return;
    }
    startedAtRef.current = new Date();
    accumulatedSecondsRef.current = 0;
    setPoints([]);
    setElapsedSeconds(0);
    lastAcceptedPointRef.current = null;
    setStatus('tracking');
    startTicker();
    await startWatcher();
  };

  const handlePause = () => {
    if (segmentStartRef.current != null) {
      accumulatedSecondsRef.current += (Date.now() - segmentStartRef.current) / 1000;
      segmentStartRef.current = null;
    }
    stopTicker();
    stopWatcher();
    setStatus('paused');
  };

  const handleResume = async () => {
    setStatus('tracking');
    startTicker();
    await startWatcher();
  };

  const handleStop = async () => {
    if (status === 'tracking') handlePause();
    if (!firebaseUser || !startedAtRef.current) return;

    const totalSeconds = accumulatedSecondsRef.current;
    const minutes = Math.max(1, Math.round(totalSeconds / 60));

    if (points.length < 2) {
      Alert.alert(t('walkTracker.tooShortTitle'), t('walkTracker.tooShortBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('walkTracker.discard'), style: 'destructive', onPress: () => router.back() },
      ]);
      return;
    }

    Alert.alert(
      t('walkTracker.saveTitle'),
      t('walkTracker.saveBody', {
        km: (routeDistanceKm(points)).toFixed(2),
        min: minutes,
      }),
      [
        { text: t('walkTracker.discard'), style: 'destructive', onPress: () => router.back() },
        {
          text: t('common.save'),
          onPress: async () => {
            setStatus('saving');
            try {
              await createTrackedWalk({
                userId: firebaseUser.uid,
                dogId: dogId!,
                startedAt: startedAtRef.current!,
                durationMinutes: minutes,
                points,
              });
              router.back();
            } catch (e: any) {
              Alert.alert(t('common.error'), e?.message ?? '');
              setStatus('paused');
            }
          },
        },
      ],
    );
  };

  // Format helpers
  const fmtTime = (s: number) => {
    const total = Math.floor(s);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    return h > 0
      ? `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
      : `${m}:${sec.toString().padStart(2, '0')}`;
  };
  const fmtPace = (p: number) => {
    if (!isFinite(p) || p === 0) return '--';
    const m = Math.floor(p);
    const sec = Math.round((p - m) * 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const initialRegion = currentPos
    ? { latitude: currentPos.lat, longitude: currentPos.lng, latitudeDelta: 0.005, longitudeDelta: 0.005 }
    : { latitude: 40.4168, longitude: -3.7038, latitudeDelta: 0.05, longitudeDelta: 0.05 };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: t('walkTracker.title') }} />

      <MapView
        provider={PROVIDER_DEFAULT}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation
        followsUserLocation={status === 'tracking'}
      >
        {points.length > 1 && (
          <Polyline
            coordinates={points.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
            strokeColor={colors.primary}
            strokeWidth={5}
          />
        )}
        {points.length > 0 && (
          <Marker
            coordinate={{ latitude: points[0].lat, longitude: points[0].lng }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.startMarker} />
          </Marker>
        )}
      </MapView>

      <View style={styles.statsCard}>
        <View style={styles.statBlockRow}>
          <View style={styles.statBlock}>
            <Text style={styles.statLabel}>{t('walkTracker.distance')}</Text>
            <Text style={styles.statValueLarge}>{distanceKm.toFixed(2)}</Text>
            <Text style={styles.statUnit}>km</Text>
          </View>
          <View style={styles.statBlock}>
            <Text style={styles.statLabel}>{t('walkTracker.duration')}</Text>
            <Text style={styles.statValueLarge}>{fmtTime(elapsedSeconds)}</Text>
            <Text style={styles.statUnit}>{t('walkTracker.timeUnit')}</Text>
          </View>
          <View style={styles.statBlock}>
            <Text style={styles.statLabel}>{t('walkTracker.pace')}</Text>
            <Text style={styles.statValueLarge}>{fmtPace(paceMinPerKm)}</Text>
            <Text style={styles.statUnit}>{t('walkTracker.paceUnit')}</Text>
          </View>
        </View>

        {permError && (
          <Text style={styles.errorText}>{t('walkTracker.permissionDenied')}</Text>
        )}

        <View style={styles.controlsRow}>
          {status === 'idle' && (
            <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={handleStart}>
              <Ionicons name="play" size={22} color={colors.textOnPrimary} />
              <Text style={styles.btnText}>{t('walkTracker.start')}</Text>
            </TouchableOpacity>
          )}
          {status === 'tracking' && (
            <>
              <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={handlePause}>
                <Ionicons name="pause" size={20} color={colors.primary} />
                <Text style={[styles.btnText, styles.btnSecondaryText]}>{t('walkTracker.pause')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnStop]} onPress={handleStop}>
                <Ionicons name="stop" size={20} color="#fff" />
                <Text style={styles.btnText}>{t('walkTracker.stop')}</Text>
              </TouchableOpacity>
            </>
          )}
          {status === 'paused' && (
            <>
              <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={handleResume}>
                <Ionicons name="play" size={20} color={colors.textOnPrimary} />
                <Text style={styles.btnText}>{t('walkTracker.resume')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnStop]} onPress={handleStop}>
                <Ionicons name="stop" size={20} color="#fff" />
                <Text style={styles.btnText}>{t('walkTracker.stop')}</Text>
              </TouchableOpacity>
            </>
          )}
          {status === 'saving' && (
            <View style={styles.savingBox}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.savingText}>{t('walkTracker.saving')}</Text>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  map: { flex: 1 },
  startMarker: {
    width: 16, height: 16, borderRadius: 8, backgroundColor: colors.primary,
    borderWidth: 3, borderColor: '#fff',
  },

  statsCard: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    ...shadow.lg,
  },
  statBlockRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statBlock: { alignItems: 'center', flex: 1 },
  statLabel: {
    fontSize: 10, color: colors.textSecondary, fontWeight: '800',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  statValueLarge: { fontSize: 28, fontWeight: '800', color: colors.text, marginTop: 2 },
  statUnit: { fontSize: 11, color: colors.textLight, fontWeight: '700' },

  errorText: {
    marginTop: spacing.sm, color: colors.error, fontSize: fontSize.xs,
    textAlign: 'center', fontWeight: '600',
  },

  controlsRow: {
    flexDirection: 'row', gap: spacing.sm,
    marginTop: spacing.md,
  },
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: spacing.md, borderRadius: borderRadius.full,
  },
  btnPrimary: { backgroundColor: colors.primary },
  btnSecondary: { backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.primary },
  btnSecondaryText: { color: colors.primary },
  btnStop: { backgroundColor: colors.error },
  btnText: { color: colors.textOnPrimary, fontWeight: '800', fontSize: fontSize.md },

  savingBox: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  savingText: { color: colors.text, fontWeight: '700' },
});
