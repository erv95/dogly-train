import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  getProviderBookingStats,
  ProviderBookingStats,
} from '../services/bookings';
import BookingMonthlyChart from './BookingMonthlyChart';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, fontSize, borderRadius, shadow, TABULAR_NUMS } from '../theme';

/** Provider-side booking stats card. Shown on the trainer + caretaker
 *  dashboards. Self-loading; fails silently if no providerId. */
export default function BookingStatsCard() {
  const { t } = useTranslation();
  const router = useRouter();
  const { firebaseUser, userData } = useAuth();
  const [stats, setStats] = useState<ProviderBookingStats | null>(null);
  const [loading, setLoading] = useState(true);

  const isProvider = userData?.role === 'trainer' || userData?.role === 'caretaker';

  useEffect(() => {
    if (!firebaseUser || !isProvider) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const s = await getProviderBookingStats(firebaseUser.uid, t, 6);
        if (!cancelled) setStats(s);
      } catch (e) {
        console.warn('Failed to load booking stats', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [firebaseUser?.uid, isProvider, t]);

  if (!isProvider) return null;

  // Route to the active role's bookings tab. The component is rendered on
  // both trainer and caretaker dashboards; pick the right tab path.
  const bookingsPath = userData?.role === 'trainer'
    ? '/(trainer)/bookings'
    : '/(caretaker)/bookings';

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() => router.push(bookingsPath as any)}
    >
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="calendar" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t('bookings.stats.title')}</Text>
          <Text style={styles.headerSubtitle}>{t('bookings.stats.subtitle')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ paddingVertical: spacing.lg }} />
      ) : stats ? (
        <>
          <View style={styles.kpiRow}>
            <View style={styles.kpi}>
              <Text style={styles.kpiValue}>{stats.completedThisMonth}</Text>
              <Text style={styles.kpiLabel}>{t('bookings.stats.completedThisMonth')}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.kpi}>
              <Text style={styles.kpiValue}>{stats.upcoming}</Text>
              <Text style={styles.kpiLabel}>{t('bookings.stats.upcoming')}</Text>
            </View>
          </View>

          {stats.monthlyCompleted.some((m) => m.count > 0) && (
            <>
              <Text style={styles.chartTitle}>{t('bookings.stats.last6Months')}</Text>
              <BookingMonthlyChart
                data={stats.monthlyCompleted.map((m) => ({ label: m.label, count: m.count }))}
              />
            </>
          )}
        </>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.primary + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.text },
  headerSubtitle: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },

  kpiRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
  },
  kpi: { flex: 1, alignItems: 'center' },
  divider: { width: 1, height: 28, backgroundColor: colors.border },
  kpiValue: {
    fontSize: 26, fontWeight: '900', color: colors.text,
    fontVariant: TABULAR_NUMS,
  },
  kpiLabel: {
    fontSize: 10, fontWeight: '700', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2,
    textAlign: 'center', paddingHorizontal: 4,
  },

  chartTitle: {
    fontSize: 10, fontWeight: '800', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 6,
  },
});
