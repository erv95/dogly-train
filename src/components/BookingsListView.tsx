import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { listMyBookings, type BookingRoleView } from '../services/bookings';
import { Booking, BookingService, BookingStatus } from '../types';
import { useAuth } from '../contexts/AuthContext';
import BookingCard from './BookingCard';
import { BookingCardSkeleton } from './skeletons';
import {
  BookingFiltersModal,
  EMPTY_FILTERS,
  activeFilterCount,
  type BookingFilters,
} from './BookingFiltersModal';
import { colors, spacing, fontSize, borderRadius } from '../theme';

type Segment = 'upcoming' | 'past' | 'cancelled';

const SEGMENT_FILTER: Record<Segment, BookingStatus | undefined> = {
  upcoming: 'confirmed',
  past: 'completed',
  cancelled: undefined,
};

/** Sort direction per segment so the closest-in-time entry is always first.
 *  - upcoming: ASC by serviceAt → soonest future first
 *  - past/cancelled: DESC by serviceAt → most recent first */
const SEGMENT_ORDER: Record<Segment, 'asc' | 'desc'> = {
  upcoming: 'asc',
  past: 'desc',
  cancelled: 'desc',
};

/** Reusable bookings list — used as the content of the per-role tab screens
 *  AND as the screen body of the shared deep-link `(shared)/bookings/index`.
 *  Owns its own segmented control + pagination + refresh + filters. */
export default function BookingsListView() {
  const { t } = useTranslation();
  const { firebaseUser, userData } = useAuth();
  const role: BookingRoleView = userData?.role === 'owner' ? 'owner' : 'provider';

  const [segment, setSegment] = useState<Segment>('upcoming');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Filters — applied client-side over the fetched page(s). Reset when the
  // segment changes so each tab starts clean.
  const [filters, setFilters] = useState<BookingFilters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const load = useCallback(async (seg: Segment, replace = true) => {
    if (!firebaseUser) return;
    if (replace) setLoading(true);
    try {
      const status = SEGMENT_FILTER[seg];
      const result = await listMyBookings(role, firebaseUser.uid, {
        status,
        cursor: replace ? null : cursor,
        pageSize: 20,
        order: SEGMENT_ORDER[seg],
      });
      let items = result.items;
      if (seg === 'cancelled') {
        items = items.filter((b) =>
          b.status === 'cancelled_by_owner'
          || b.status === 'cancelled_by_provider'
          || b.status === 'expired',
        );
      } else if (seg === 'upcoming') {
        // Hide bookings whose serviceEndAt is already in the past — the
        // hourly auto-expire cron will eventually move them to `expired`,
        // but client-side filtering keeps "Próximas" honest in real time.
        const nowMs = Date.now();
        items = items.filter((b) => (b.serviceEndAt?.toMillis?.() ?? 0) >= nowMs);
      }
      setBookings((prev) => (replace ? items : [...prev, ...items]));
      setCursor(result.nextCursor);
    } catch (e) {
      console.error('listMyBookings error', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [firebaseUser?.uid, role, cursor]);

  useFocusEffect(
    useCallback(() => {
      load(segment, true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [segment, firebaseUser?.uid])
  );

  const handleSegment = (s: Segment) => {
    if (s === segment) return;
    setSegment(s);
    setCursor(null);
    setBookings([]);
    setFilters(EMPTY_FILTERS);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    load(segment, true);
  };

  const handleLoadMore = () => {
    if (loadingMore || !cursor) return;
    setLoadingMore(true);
    load(segment, false);
  };

  // Derived: dropdown options come from what the user actually has loaded
  // (avoids showing filters that wouldn't match anything).
  const availableDogs = useMemo(() => {
    const set = new Set<string>();
    for (const b of bookings) if (b.dogName) set.add(b.dogName);
    return Array.from(set).sort();
  }, [bookings]);

  const availableServices = useMemo(() => {
    const set = new Set<BookingService>();
    for (const b of bookings) set.add(b.service);
    return Array.from(set);
  }, [bookings]);

  const visibleBookings = useMemo(() => {
    if (filters.dogNames.length === 0 && filters.services.length === 0) return bookings;
    return bookings.filter((b) => {
      if (filters.dogNames.length > 0 && !filters.dogNames.includes(b.dogName)) return false;
      if (filters.services.length > 0 && !filters.services.includes(b.service)) return false;
      return true;
    });
  }, [bookings, filters]);

  const filterCount = activeFilterCount(filters);

  return (
    <View style={styles.container}>
      {/* Segmented control + filters button */}
      <View style={styles.topRow}>
        <View style={styles.segments}>
          {(['upcoming', 'past', 'cancelled'] as Segment[]).map((s) => {
            const active = segment === s;
            return (
              <TouchableOpacity
                key={s}
                style={[styles.segment, active && styles.segmentActive]}
                onPress={() => handleSegment(s)}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {t(`bookings.list.tabs.${s}`)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity
          style={[styles.filterBtn, filterCount > 0 && styles.filterBtnActive]}
          onPress={() => setFiltersOpen(true)}
          accessibilityLabel={t('bookings.filters.title')}
        >
          <Ionicons
            name="options-outline"
            size={20}
            color={filterCount > 0 ? colors.textOnPrimary : colors.text}
          />
          {filterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{filterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.list}>
          <BookingCardSkeleton count={4} />
        </View>
      ) : (
        <FlatList
          data={visibleBookings}
          keyExtractor={(b) => b.id}
          renderItem={({ item }) => <BookingCard booking={item} viewerRole={role} />}
          contentContainerStyle={visibleBookings.length === 0 ? styles.emptyList : styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={48} color={colors.textLight} />
              <Text style={styles.emptyTitle}>
                {filterCount > 0
                  ? t('bookings.filters.noResultsTitle')
                  : t(`bookings.list.empty.${segment}.title`)}
              </Text>
              <Text style={styles.emptyBody}>
                {filterCount > 0
                  ? t('bookings.filters.noResultsBody')
                  : t(`bookings.list.empty.${segment}.body`)}
              </Text>
              {filterCount > 0 && (
                <TouchableOpacity
                  style={styles.resetBtn}
                  onPress={() => setFilters(EMPTY_FILTERS)}
                >
                  <Text style={styles.resetBtnText}>{t('bookings.filters.reset')}</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          ListFooterComponent={
            cursor && !loadingMore ? (
              <TouchableOpacity style={styles.loadMore} onPress={handleLoadMore} activeOpacity={0.85}>
                <Ionicons name="chevron-down" size={16} color={colors.primary} />
                <Text style={styles.loadMoreText}>{t('common.loadMore')}</Text>
                <Ionicons name="chevron-down" size={16} color={colors.primary} />
              </TouchableOpacity>
            ) : loadingMore ? (
              <ActivityIndicator color={colors.primary} style={{ paddingVertical: spacing.lg }} />
            ) : null
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} />
          }
        />
      )}

      <BookingFiltersModal
        visible={filtersOpen}
        availableDogs={availableDogs}
        availableServices={availableServices}
        value={filters}
        onClose={() => setFiltersOpen(false)}
        onApply={(next) => {
          setFilters(next);
          setFiltersOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  loader: { flex: 1 },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  segments: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  segment: {
    flex: 1, paddingVertical: 8, alignItems: 'center',
    borderRadius: borderRadius.full, backgroundColor: colors.backgroundSecondary,
  },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textSecondary },
  segmentTextActive: { color: colors.textOnPrimary },
  filterBtn: {
    width: 40, height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center', justifyContent: 'center',
  },
  filterBtnActive: { backgroundColor: colors.primary },
  filterBadge: {
    position: 'absolute', top: -4, right: -4,
    backgroundColor: colors.error,
    borderRadius: 10, minWidth: 18, height: 18,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2, borderColor: colors.background,
  },
  filterBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  list: { padding: spacing.lg },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text },
  emptyBody: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
  resetBtn: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
  },
  resetBtnText: { color: colors.textOnPrimary, fontWeight: '800', fontSize: fontSize.sm },

  loadMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    margin: spacing.md, paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1.5, borderColor: colors.primary + '40',
    backgroundColor: colors.primary + '10',
  },
  loadMoreText: { color: colors.primary, fontWeight: '800', fontSize: fontSize.sm },
});
