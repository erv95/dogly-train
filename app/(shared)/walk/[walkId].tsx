import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Polyline, Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { getWalk, deleteWalk } from '../../../src/services/dogWalks';
import { DogWalk } from '../../../src/types';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../../src/theme';

export default function WalkDetailScreen() {
  const { walkId } = useLocalSearchParams<{ walkId: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const [walk, setWalk] = useState<DogWalk | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!walkId) return;
    getWalk(walkId).then(setWalk).finally(() => setLoading(false));
  }, [walkId]);

  const region = useMemo(() => {
    if (!walk?.route || walk.route.length === 0) return null;
    const lats = walk.route.map((p) => p.lat);
    const lngs = walk.route.map((p) => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(0.005, (maxLat - minLat) * 1.4),
      longitudeDelta: Math.max(0.005, (maxLng - minLng) * 1.4),
    };
  }, [walk]);

  const handleDelete = () => {
    if (!walk) return;
    Alert.alert(
      t('walkTracker.deleteTitle'),
      t('walkTracker.deleteConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteWalk(walk.id);
              router.back();
            } catch {
              Alert.alert(t('common.error'));
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={styles.loader} color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  if (!walk) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.empty}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.textLight} />
          <Text style={styles.emptyText}>{t('walkTracker.notFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const dateStr = walk.startedAt.toDate().toLocaleString(undefined, {
    dateStyle: 'long', timeStyle: 'short',
  });

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: t('walkTracker.detailTitle'),
          headerRight: () => (
            <TouchableOpacity onPress={handleDelete} style={{ paddingHorizontal: spacing.sm }}>
              <Ionicons name="trash-outline" size={22} color={colors.error} />
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {region && walk.route && walk.route.length > 1 ? (
          <MapView
            provider={PROVIDER_DEFAULT}
            style={styles.map}
            initialRegion={region}
            scrollEnabled
            zoomEnabled
            pitchEnabled={false}
            rotateEnabled={false}
          >
            <Polyline
              coordinates={walk.route.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
              strokeColor={colors.primary}
              strokeWidth={5}
            />
            <Marker
              coordinate={{ latitude: walk.route[0].lat, longitude: walk.route[0].lng }}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.startMarker} />
            </Marker>
            <Marker
              coordinate={{
                latitude: walk.route[walk.route.length - 1].lat,
                longitude: walk.route[walk.route.length - 1].lng,
              }}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.endMarker} />
            </Marker>
          </MapView>
        ) : (
          <View style={[styles.map, styles.noRoute]}>
            <Ionicons name="map-outline" size={40} color={colors.textLight} />
            <Text style={styles.noRouteText}>{t('walkTracker.noRouteSaved')}</Text>
          </View>
        )}

        <View style={styles.dateRow}>
          <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.dateText}>{dateStr}</Text>
        </View>

        <View style={styles.statsCard}>
          <View style={styles.statBlock}>
            <Text style={styles.statLabel}>{t('walkTracker.distance')}</Text>
            <Text style={styles.statValue}>
              {walk.distanceKm != null ? `${walk.distanceKm.toFixed(2)} km` : '—'}
            </Text>
          </View>
          <View style={styles.statBlock}>
            <Text style={styles.statLabel}>{t('walkTracker.duration')}</Text>
            <Text style={styles.statValue}>{walk.durationMinutes} min</Text>
          </View>
          <View style={styles.statBlock}>
            <Text style={styles.statLabel}>{t('walkTracker.pace')}</Text>
            <Text style={styles.statValue}>
              {walk.paceMinPerKm
                ? `${Math.floor(walk.paceMinPerKm)}:${Math.round((walk.paceMinPerKm % 1) * 60).toString().padStart(2, '0')} /km`
                : '—'}
            </Text>
          </View>
        </View>

        {walk.notes && (
          <View style={styles.notesCard}>
            <Text style={styles.notesLabel}>{t('walkTracker.notes')}</Text>
            <Text style={styles.notesText}>{walk.notes}</Text>
          </View>
        )}

        {walk.trackedByGps && (
          <View style={styles.gpsBadge}>
            <Ionicons name="locate" size={12} color={colors.primary} />
            <Text style={styles.gpsBadgeText}>{t('walkTracker.gpsCaptured')}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  loader: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyText: { color: colors.textSecondary, fontSize: fontSize.md },

  body: { paddingBottom: spacing.xxl },
  map: { width: '100%', height: 280, backgroundColor: colors.backgroundSecondary },
  noRoute: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  noRouteText: { color: colors.textSecondary, fontSize: fontSize.sm },
  startMarker: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.primary, borderWidth: 3, borderColor: '#fff' },
  endMarker: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.error, borderWidth: 3, borderColor: '#fff' },

  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: spacing.lg, paddingBottom: 0 },
  dateText: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '600' },

  statsCard: {
    flexDirection: 'row',
    margin: spacing.lg,
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    ...shadow.sm,
  },
  statBlock: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 10, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text, marginTop: 4 },

  notesCard: { marginHorizontal: spacing.lg, padding: spacing.md, backgroundColor: colors.background, borderRadius: borderRadius.md, ...shadow.sm },
  notesLabel: { fontSize: fontSize.xs, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.xs },
  notesText: { fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },

  gpsBadge: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary + '15',
  },
  gpsBadgeText: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '700' },
});
