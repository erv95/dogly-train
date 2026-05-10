import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { searchPlaces, PlaceSearchResult } from '../../../src/services/places';
import { PlaceCategory } from '../../../src/types';
import { StarRating } from '../../../src/components/ui';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../../src/theme';

type CategoryFilter = PlaceCategory | 'all';

const CATEGORIES: { key: CategoryFilter; icon: string }[] = [
  { key: 'all', icon: 'grid-outline' },
  { key: 'park', icon: 'leaf-outline' },
  { key: 'restaurant', icon: 'restaurant-outline' },
  { key: 'beach', icon: 'sunny-outline' },
  { key: 'hotel', icon: 'bed-outline' },
  { key: 'shop', icon: 'storefront-outline' },
  { key: 'training_field', icon: 'fitness-outline' },
  { key: 'event', icon: 'calendar-outline' },
];

export default function PlacesListScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [places, setPlaces] = useState<PlaceSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [category, setCategory] = useState<CategoryFilter>('all');

  const getLocation = useCallback(async (): Promise<[number, number] | null> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationDenied(true);
        return null;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const c: [number, number] = [loc.coords.latitude, loc.coords.longitude];
      setCoords(c);
      setLocationDenied(false);
      return c;
    } catch {
      setLocationDenied(true);
      return null;
    }
  }, []);

  const load = useCallback(async (c: [number, number] | null, cat: CategoryFilter) => {
    try {
      const results = await searchPlaces({ center: c, category: cat });
      setPlaces(results);
    } catch (e) {
      console.error('Error loading places:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const c = await getLocation();
      load(c, category);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    const c = await getLocation();
    load(c ?? coords, category);
  };

  const handleSelectCategory = (c: CategoryFilter) => {
    setCategory(c);
    setLoading(true);
    load(coords, c);
  };

  const renderHeader = () => (
    <View>
      {locationDenied && (
        <View style={styles.notice}>
          <Ionicons name="location-outline" size={16} color={colors.warning} />
          <Text style={styles.noticeText}>{t('places.locationDeniedHint')}</Text>
        </View>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {CATEGORIES.map((c) => {
          const active = category === c.key;
          return (
            <TouchableOpacity
              key={c.key}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => handleSelectCategory(c.key)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={c.icon as any}
                size={14}
                color={active ? colors.textOnPrimary : colors.textSecondary}
              />
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {t(`places.categories.${c.key}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderItem = ({ item }: { item: PlaceSearchResult }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/(shared)/places/${item.id}`)}
      activeOpacity={0.85}
    >
      {item.photoURL ? (
        <Image source={{ uri: item.photoURL }} style={styles.photo} />
      ) : (
        <View style={[styles.photo, styles.photoPlaceholder]}>
          <Ionicons name="image-outline" size={28} color={colors.textLight} />
        </View>
      )}
      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
          {coords && (
            <Text style={styles.cardDistance}>
              {item.distanceKm < 1
                ? `${Math.round(item.distanceKm * 1000)} m`
                : `${item.distanceKm.toFixed(1)} km`}
            </Text>
          )}
        </View>
        <View style={styles.cardRow}>
          <Ionicons
            name={(CATEGORIES.find((c) => c.key === item.category)?.icon ?? 'pin-outline') as any}
            size={12}
            color={colors.primary}
          />
          <Text style={styles.cardCategory}>{t(`places.categories.${item.category}`)}</Text>
          <Text style={styles.cardCity} numberOfLines={1}>· {item.city}</Text>
        </View>
        {item.totalRatings > 0 && (
          <View style={styles.cardRow}>
            <StarRating rating={item.averageRating} size={12} />
            <Text style={styles.cardRating}>
              {item.averageRating.toFixed(1)} ({item.totalRatings})
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    <View style={styles.empty}>
      <Ionicons name="map-outline" size={56} color={colors.textLight} />
      <Text style={styles.emptyTitle}>{t('places.emptyTitle')}</Text>
      <Text style={styles.emptySubtitle}>{t('places.emptySubtitle')}</Text>
      <TouchableOpacity
        style={styles.emptyCta}
        onPress={() => router.push('/(shared)/place-form')}
      >
        <Ionicons name="add-circle-outline" size={18} color={colors.textOnPrimary} />
        <Text style={styles.emptyCtaText}>{t('places.proposeCta')}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} size="large" />
      ) : (
        <FlatList
          data={places}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={places.length === 0 ? styles.emptyList : styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} />
          }
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/(shared)/place-form')}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={26} color={colors.textOnPrimary} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  loader: { flex: 1 },

  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.warning + '15',
    borderWidth: 1,
    borderColor: colors.warning + '40',
  },
  noticeText: { flex: 1, fontSize: fontSize.xs, color: colors.text },

  chipsRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.xs,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textSecondary },
  chipTextActive: { color: colors.textOnPrimary },

  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  emptyList: { flexGrow: 1 },

  card: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    marginTop: spacing.sm,
    ...shadow.sm,
  },
  photo: {
    width: 84,
    height: 84,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundSecondary,
  },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, paddingLeft: spacing.sm, justifyContent: 'center', gap: 4 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardName: { flex: 1, fontSize: fontSize.md, fontWeight: '800', color: colors.text },
  cardDistance: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '700' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardCategory: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '700' },
  cardCity: { fontSize: fontSize.xs, color: colors.textSecondary, flex: 1 },
  cardRating: { fontSize: fontSize.xs, color: colors.textSecondary, marginLeft: 4 },

  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
  emptySubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    marginTop: spacing.md,
  },
  emptyCtaText: { color: colors.textOnPrimary, fontWeight: '800' },

  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.lg,
  },
});
