import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useDogStats } from '../contexts/DogStatsContext';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../theme';

/**
 * Mini Monday–Sunday strip with one dot per day (Iter 8.7.2).
 *
 * Highlights the days in the current ISO week where the dog logged
 * activity, plus the user's current streak. Activity is derived from
 * `DogStats.lastActivityDate` + `currentStreak` — we don't have a
 * day-by-day log, but the streak tells us how many consecutive days
 * back from `lastActivityDate` were active, so we can paint that range
 * into the strip.
 */
interface Props {
  dogId: string;
}

const DAY_LABELS_KEY = ['common.day.mon', 'common.day.tue', 'common.day.wed', 'common.day.thu', 'common.day.fri', 'common.day.sat', 'common.day.sun'];

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getMonday(d: Date): Date {
  const day = d.getDay(); // 0 = Sun, 1 = Mon, ... 6 = Sat
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  const monday = new Date(d);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(d.getDate() + diff);
  return monday;
}

export default function WeekStrip({ dogId: _dogId }: Props) {
  const { t } = useTranslation();
  // Stats come from the shared DogStatsContext (HIGH-8 of Iter 8.7.6).
  // The dogId prop is preserved for API compatibility but is now unused;
  // the provider is scoped to the dog at the screen level.
  const { stats } = useDogStats();

  // Build the active set of ISO dates from streak + lastActivityDate.
  const activeDates = new Set<string>();
  if (stats?.lastActivityDate && stats.currentStreak > 0) {
    const last = new Date(stats.lastActivityDate);
    for (let i = 0; i < stats.currentStreak; i++) {
      const d = new Date(last);
      d.setDate(last.getDate() - i);
      activeDates.add(isoDay(d));
    }
  }

  const today = new Date();
  const todayIso = isoDay(today);
  const monday = getMonday(today);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = isoDay(d);
    return {
      iso,
      labelKey: DAY_LABELS_KEY[i],
      isToday: iso === todayIso,
      isActive: activeDates.has(iso),
      isFuture: d > today,
    };
  });

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.headerLabel}>{t('owner.thisWeek')}</Text>
        {(stats?.currentStreak ?? 0) > 0 && (
          <View style={styles.streakBadge}>
            <Text style={styles.streakEmoji}>🔥</Text>
            <Text style={styles.streakText}>
              {t('progress.streakDays', { count: stats?.currentStreak ?? 0 })}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.daysRow}>
        {days.map((d) => (
          <View key={d.iso} style={styles.dayCol}>
            <Text
              style={[
                styles.dayLabel,
                d.isToday && styles.dayLabelToday,
                d.isFuture && styles.dayLabelFuture,
              ]}
            >
              {t(d.labelKey)}
            </Text>
            <View
              style={[
                styles.dot,
                d.isActive && styles.dotActive,
                d.isToday && !d.isActive && styles.dotToday,
                d.isFuture && styles.dotFuture,
              ]}
            >
              {d.isActive && (
                <Ionicons name="checkmark" size={12} color={colors.textOnPrimary} />
              )}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  headerLabel: {
    fontSize: fontSize.xs,
    fontFamily: fontFamily.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F59E0B' + '18',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  streakEmoji: { fontSize: 12 },
  streakText: {
    fontSize: 11,
    color: '#92400E',
    fontFamily: fontFamily.bold,
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayCol: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  dayLabel: {
    fontSize: 10,
    fontFamily: fontFamily.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  dayLabelToday: { color: colors.primary },
  dayLabelFuture: { color: colors.textLight },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: { backgroundColor: colors.primary },
  dotToday: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  dotFuture: { backgroundColor: colors.borderLight, opacity: 0.5 },
});
