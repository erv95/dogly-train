import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  Modal,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useAppAlert } from '../../../src/contexts/AlertContext';
import {
  startLiveSession,
  endLiveSession,
  pushLocations,
  uploadLivePhoto,
  subscribeToLiveSession,
  getLiveSessionOnce,
} from '../../../src/services/liveSessions';
import { LivePathPoint, LivePhoto, LiveSession } from '../../../src/types';
import { LiveMapView } from '../../../src/components/LiveMapView';
import { useHaptics } from '../../../src/hooks/useHaptics';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../../src/theme';

const FLUSH_INTERVAL_MS = 30_000;

// Disk-backed queue so we don't lose GPS samples on app crash, OS kill, or
// network failure during a flush. The in-memory queueRef is still the
// primary; AsyncStorage is the recovery cushion.
type PendingPoint = { lat: number; lng: number; recordedAt: Date };
const queueStorageKey = (bookingId: string) => `@livesession_queue_${bookingId}`;

async function persistQueue(bookingId: string, queue: PendingPoint[]): Promise<void> {
  try {
    if (queue.length === 0) {
      await AsyncStorage.removeItem(queueStorageKey(bookingId));
    } else {
      await AsyncStorage.setItem(queueStorageKey(bookingId), JSON.stringify(queue));
    }
  } catch {
    // best-effort — don't crash the app over storage failure
  }
}

async function restoreQueue(bookingId: string): Promise<PendingPoint[]> {
  try {
    const raw = await AsyncStorage.getItem(queueStorageKey(bookingId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Validate each entry — corrupted AsyncStorage can produce NaN coords
    // or Invalid Date which later poisons distance/polyline calculations.
    const valid: PendingPoint[] = [];
    for (const p of parsed) {
      const lat = Number(p?.lat);
      const lng = Number(p?.lng);
      const ts = new Date(p?.recordedAt);
      if (!isFinite(lat) || !isFinite(lng)) continue;
      if (isNaN(ts.getTime())) continue;
      valid.push({ lat, lng, recordedAt: ts });
    }
    return valid;
  } catch {
    return [];
  }
}

export default function LiveSessionScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { firebaseUser } = useAuth();
  const { showAlert } = useAppAlert();
  const haptics = useHaptics();
  // Window dimensions are recomputed on rotation / foldable / split-screen.
  const { width: SCREEN_W } = useWindowDimensions();

  const [session, setSession] = useState<LiveSession | null>(null);
  const [path, setPath] = useState<LivePathPoint[]>([]);
  const [photos, setPhotos] = useState<LivePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'start' | 'end' | 'photo' | null>(null);
  const [photoModal, setPhotoModal] = useState<string | null>(null);

  // Provider-side: in-memory queue of pending GPS samples + flush timer
  const queueRef = useRef<{ lat: number; lng: number; recordedAt: Date }[]>([]);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isProvider = !!session && firebaseUser?.uid === session.providerId;
  const isOwner = !!session && firebaseUser?.uid === session.ownerId;

  // ── Subscribe to live session + sub-collections ────────────────────────────

  useEffect(() => {
    if (!bookingId) return;
    let unsub: (() => void) | null = null;
    (async () => {
      try {
        // First check if a session already exists
        const initial = await getLiveSessionOnce(bookingId);
        setSession(initial);
        unsub = subscribeToLiveSession(bookingId, ({ session, path, photos }) => {
          setSession(session);
          setPath(path);
          setPhotos(photos);
        });
      } catch (err) {
        // Offline, or permission-denied on an expired/cancelled booking opened
        // via deep link. Without this the spinner below would hang forever.
        console.error('Error loading live session:', err);
        showAlert(t('common.oops'), t('errors.loadFailed'));
      } finally {
        setLoading(false);
      }
    })();
    return () => { if (unsub) unsub(); };
  }, [bookingId]);

  // ── Provider GPS loop — only when session is active and we are the provider

  useEffect(() => {
    if (!isProvider || session?.status !== 'active') return;

    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('liveSession.permErrorTitle'), t('liveSession.permErrorBody'));
        return;
      }
      if (cancelled) return;

      // Recover any points that didn't make it off the device last time
      // (app crash, OS kill, network failure mid-flush).
      const recovered = await restoreQueue(bookingId);
      if (!cancelled && recovered.length > 0) {
        queueRef.current.push(...recovered);
      }

      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 10_000,
          distanceInterval: 20,
        },
        (loc) => {
          queueRef.current.push({
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
            recordedAt: new Date(loc.timestamp),
          });
          // Persist after each sample. Cheap (~ms) and means a crash between
          // samples loses at most the in-flight write, not the whole queue.
          persistQueue(bookingId, queueRef.current);
        },
      );

      flushTimerRef.current = setInterval(async () => {
        const queue = queueRef.current;
        if (queue.length === 0) return;
        queueRef.current = [];
        try {
          await pushLocations(bookingId, queue);
          // Successful push — clear the disk cushion for these points.
          await persistQueue(bookingId, queueRef.current);
        } catch (e) {
          // Re-queue on failure so we don't lose points. Disk already has
          // them via the watch callback, but persist current state for
          // good measure.
          queueRef.current.unshift(...queue);
          await persistQueue(bookingId, queueRef.current);
        }
      }, FLUSH_INTERVAL_MS);
    })();

    return () => {
      cancelled = true;
      if (watchRef.current) {
        watchRef.current.remove();
        watchRef.current = null;
      }
      if (flushTimerRef.current) {
        clearInterval(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      // Final flush (best-effort). Anything still pending stays on disk
      // and will be recovered on next mount.
      const q = queueRef.current;
      if (q.length > 0) {
        queueRef.current = [];
        pushLocations(bookingId, q).then(
          () => persistQueue(bookingId, []),
          () => persistQueue(bookingId, q),
        );
      }
    };
  }, [isProvider, session?.status, bookingId]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleStart = async () => {
    if (!bookingId) return;
    setBusy('start');
    try {
      const s = await startLiveSession(bookingId);
      setSession(s);
      haptics.success();
    } catch (e: any) {
      haptics.error();
      const code = e?.message ?? 'unknown';
      Alert.alert(t('common.error'), t(`liveSession.errors.${code}`, { defaultValue: t('liveSession.errors.unknown') }));
    } finally {
      setBusy(null);
    }
  };

  const handleEnd = async () => {
    if (!bookingId) return;
    Alert.alert(
      t('liveSession.endTitle'),
      t('liveSession.endConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('liveSession.endCta'),
          style: 'destructive',
          onPress: async () => {
            setBusy('end');
            try {
              await endLiveSession(bookingId);
              haptics.warning();
            } catch (e: any) {
              haptics.error();
              Alert.alert(t('common.error'), t('authErrors.generic'));
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  const handleTakePhoto = async () => {
    if (!bookingId) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert(t('common.error'), t('liveSession.cameraPermBody'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) return;

    setBusy('photo');
    try {
      // Compress to max 1024px width to keep storage costs low
      const compressed = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 1024 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
      );
      await uploadLivePhoto(bookingId, compressed.uri);
      haptics.success();
    } catch (e) {
      haptics.error();
      Alert.alert(t('common.error'), t('authErrors.generic'));
    } finally {
      setBusy(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  // No session yet — only the provider gets the "Start" CTA
  if (!session) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Stack.Screen options={{ title: t('liveSession.title') }} />
        <View style={styles.empty}>
          <Ionicons name="location-outline" size={48} color={colors.textLight} />
          <Text style={styles.emptyTitle}>{t('liveSession.notStartedTitle')}</Text>
          <Text style={styles.emptyBody}>{t('liveSession.notStartedBody')}</Text>
          <TouchableOpacity
            style={[styles.cta, busy === 'start' && styles.ctaDisabled]}
            onPress={handleStart}
            disabled={busy === 'start'}
          >
            <Ionicons name="play" size={16} color={colors.textOnPrimary} />
            <Text style={styles.ctaText}>{t('liveSession.startCta')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: t('liveSession.title') }} />

      {/* Map */}
      <View style={styles.map}>
        <LiveMapView path={path} />
      </View>

      {/* Status bar */}
      <View style={styles.statusBar}>
        <View
          style={[
            styles.statusDot,
            { backgroundColor: session.status === 'active' ? colors.success : colors.textLight },
          ]}
        />
        <Text style={styles.statusText}>
          {t(`liveSession.status.${session.status}`)}
        </Text>
        <Text style={styles.statusMeta}>
          {path.length} {t('liveSession.points')}
          {' · '}
          {photos.length} {t('liveSession.photos')}
        </Text>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        {isProvider && session.status === 'active' && (
          <>
            <TouchableOpacity
              style={[styles.btn, styles.btnSecondary]}
              onPress={handleTakePhoto}
              disabled={busy !== null}
            >
              <Ionicons name="camera" size={18} color={colors.primary} />
              <Text style={styles.btnSecondaryText}>{t('liveSession.takePhoto')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnDanger]}
              onPress={handleEnd}
              disabled={busy !== null}
            >
              <Ionicons name="stop" size={18} color={colors.textOnPrimary} />
              <Text style={styles.btnDangerText}>{t('liveSession.endCta')}</Text>
            </TouchableOpacity>
          </>
        )}
        {isOwner && session.status === 'active' && (
          <Text style={styles.muted}>{t('liveSession.ownerLiveHint')}</Text>
        )}
        {session.status === 'ended' && (
          <Text style={styles.muted}>{t('liveSession.endedHint')}</Text>
        )}
      </View>

      {/* Photo grid */}
      {photos.length > 0 && (
        <ScrollView horizontal style={styles.photoStrip} showsHorizontalScrollIndicator={false}>
          {photos.map((p) => (
            <TouchableOpacity key={p.id} onPress={() => setPhotoModal(p.url)}>
              <Image source={{ uri: p.url }} style={styles.thumb} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Fullscreen photo viewer */}
      <Modal visible={!!photoModal} transparent animationType="fade" onRequestClose={() => setPhotoModal(null)}>
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setPhotoModal(null)} activeOpacity={1}>
          {photoModal && (
            <Image source={{ uri: photoModal }} style={{ width: SCREEN_W, height: SCREEN_W * 1.3 }} resizeMode="contain" />
          )}
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  map: { flex: 1, minHeight: 280 },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderColor: colors.borderLight,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  statusMeta: { marginLeft: 'auto', fontSize: fontSize.xs, color: colors.textSecondary },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.background,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
  },
  btnSecondary: { backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.primary },
  btnSecondaryText: { color: colors.primary, fontWeight: '700' },
  btnDanger: { backgroundColor: colors.error },
  btnDangerText: { color: colors.textOnPrimary, fontWeight: '700' },
  muted: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', flex: 1 },
  photoStrip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
  },
  thumb: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.md,
    marginRight: spacing.sm,
    backgroundColor: colors.borderLight,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  emptyTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text, textAlign: 'center' },
  emptyBody: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    marginTop: spacing.md,
    ...shadow.sm,
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { color: colors.textOnPrimary, fontWeight: '800' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // modalImage dimensions are inlined in render (depend on useWindowDimensions)
});
