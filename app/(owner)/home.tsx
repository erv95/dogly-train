import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { searchTrainers, TrainerSearchResult } from '../../src/services/trainers';
import { Card, Avatar, StarRating } from '../../src/components/ui';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../src/theme';

const RADIUS_OPTIONS = [10, 25, 50, 100];

export default function OwnerHomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [trainers, setTrainers] = useState<TrainerSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [radiusKm, setRadiusKm] = useState(50);
  const [locationError, setLocationError] = useState(false);

  const getLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError(true);
        setLoading(false);
        return null;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const coords: [number, number] = [loc.coords.latitude, loc.coords.longitude];
      setUserLocation(coords);
      setLocationError(false);
      return coords;
    } catch {
      setLocationError(true);
      setLoading(false);
      return null;
    }
  }, []);

  const loadTrainers = useCallback(async (coords?: [number, number] | null, radius?: number) => {
    const center = coords ?? userLocation;
    if (!center) return;
    try {
      const results = await searchTrainers(center, radius ?? radiusKm);
      setTrainers(results);
    } catch (error) {
      console.error('Error searching trainers:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userLocation, radiusKm]);

  useEffect(() => {
    (async () => {
      const coords = await getLocation();
      if (coords) {
        loadTrainers(coords);
      }
    })();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    const coords = await getLocation();
    if (coords) {
      loadTrainers(coords);
    } else {
      setRefreshing(false);
    }
  };

  const handleRadiusChange = (newRadius: number) => {
    setRadiusKm(newRadius);
    setLoading(true);
    loadTrainers(userLocation, newRadius);
  };

  const renderTrainerCard = ({ item }: { item: TrainerSearchResult }) => {
    const isBoosted = item.boostedUntil &&
      (item.boostedUntil as any).toDate() > new Date();

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => router.push(`/(shared)/trainer/${item.id}`)}
      >
        <Card style={[styles.trainerCard, isBoosted ? styles.boostedCard : undefined]}>
          {isBoosted && (
            <View style={styles.boostBadge}>
              <Ionicons name="flash" size={12} color={colors.boost} />
              <Text style={styles.boostBadgeText}>{t('owner.featured')}</Text>
            </View>
          )}
          <View style={styles.trainerRow}>
            <Avatar
              uri={item.photoURL}
              name={item.displayName}
              size={56}
            />
            <View style={styles.trainerInfo}>
              <Text style={styles.trainerName}>{item.displayName}</Text>
              {item.city ? (
                <View style={styles.locationRow}>
                  <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
                  <Text style={styles.trainerCity}>
                    {item.city} · {item.distanceKm.toFixed(1)} km
                  </Text>
                </View>
              ) : null}
              <View style={styles.ratingRow}>
                <StarRating rating={item.averageRating} size={14} />
                <Text style={styles.ratingText}>
                  {item.averageRating.toFixed(1)} ({item.totalReviews})
                </Text>
              </View>
            </View>
            <View style={styles.priceCol}>
              <Text style={styles.priceValue}>
                {item.pricePerSession}{item.currency === 'EUR' ? '€' : item.currency}
              </Text>
              <Text style={styles.priceLabel}>{t('trainer.pricePerSession').split(' ').pop()}</Text>
            </View>
          </View>
          {item.specialties.length > 0 && (
            <View style={styles.specialties}>
              {item.specialties.slice(0, 3).map((s, i) => (
                <View key={i} style={styles.specialtyTag}>
                  <Text style={styles.specialtyText}>{s}</Text>
                </View>
              ))}
            </View>
          )}
        </Card>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;
    if (locationError) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="location-outline" size={64} color={colors.textLight} />
          <Text style={styles.emptyText}>{t('authErrors.generic')}</Text>
          <Button
            title={t('trainer.getLocation')}
            onPress={async () => {
              setLoading(true);
              const coords = await getLocation();
              if (coords) loadTrainers(coords);
            }}
          />
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="search-outline" size={64} color={colors.textLight} />
        <Text style={styles.emptyText}>{t('common.noResults')}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('owner.searchTrainers')}</Text>
      </View>

      {/* Radius filter */}
      <View style={styles.filterRow}>
        {RADIUS_OPTIONS.map((r) => (
          <TouchableOpacity
            key={r}
            style={[styles.filterChip, radiusKm === r && styles.filterChipActive]}
            onPress={() => handleRadiusChange(r)}
          >
            <Text style={[styles.filterChipText, radiusKm === r && styles.filterChipTextActive]}>
              {r} km
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={trainers}
        keyExtractor={(item) => item.id}
        renderItem={renderTrainerCard}
        contentContainerStyle={trainers.length === 0 ? styles.emptyList : styles.list}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
          />
        }
      />
    </SafeAreaView>
  );
}

// Inline Button for empty state (avoid circular import issues)
function Button({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.retryBtn} onPress={onPress}>
      <Text style={styles.retryBtnText}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.textOnPrimary,
    fontWeight: '600',
  },
  list: {
    padding: spacing.lg,
    paddingTop: 0,
    gap: spacing.md,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  trainerCard: {
    marginBottom: spacing.sm,
  },
  boostedCard: {
    borderWidth: 1,
    borderColor: colors.boost + '60',
    backgroundColor: colors.boost + '08',
  },
  boostBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: spacing.sm,
  },
  boostBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.boost,
  },
  trainerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trainerInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  trainerName: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  trainerCity: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 4,
  },
  ratingText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  priceCol: {
    alignItems: 'flex-end',
  },
  priceValue: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.primary,
  },
  priceLabel: {
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
  specialties: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  specialtyTag: {
    backgroundColor: colors.secondary + '15',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  specialtyText: {
    fontSize: fontSize.xs,
    color: colors.secondary,
    fontWeight: '600',
  },
  retryBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
  },
  retryBtnText: {
    color: colors.textOnPrimary,
    fontWeight: '600',
    fontSize: fontSize.sm,
  },
});
