import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { WeightEntry } from '../types';
import { colors, spacing, fontSize, borderRadius } from '../theme';

interface Props {
  /** Weight entries (any order). The last `maxBars` will be displayed. */
  entries: WeightEntry[];
  /** Max number of bars to render (most recent). Default: 12. */
  maxBars?: number;
}

const CHART_HEIGHT = 160;       // px height of the bar area
const MIN_BAR_HEIGHT_PCT = 12;  // never let a bar render with 0 height — visual minimum
const BAR_WIDTH = 18;

/**
 * Lightweight bar chart using only <View>. No SVG dependency.
 *
 * - Each bar represents one weight entry, scaled relative to the min/max in view
 * - Most recent bar highlighted
 * - Date labels rotated 45° below each bar (compact)
 */
export default function WeightChart({ entries, maxBars = 12 }: Props) {
  const { i18n } = useTranslation();

  const { visible, min, max, range } = useMemo(() => {
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    const recent = sorted.slice(-maxBars);
    const values = recent.map((e) => e.value);
    const mn = values.length > 0 ? Math.min(...values) : 0;
    const mx = values.length > 0 ? Math.max(...values) : 0;
    return {
      visible: recent,
      min: mn,
      max: mx,
      range: mx - mn || 1, // avoid divide-by-zero when all values equal
    };
  }, [entries, maxBars]);

  if (visible.length === 0) return null;

  // If all values equal: render uniform mid-height bars
  const allSame = max === min;
  const lastIndex = visible.length - 1;

  return (
    <View style={styles.container}>
      {/* Y-axis labels (max + min) */}
      <View style={styles.yAxisRow}>
        <Text style={styles.yAxisLabel}>{max.toFixed(1)} kg</Text>
        <View style={styles.gridLine} />
      </View>

      {/* Bars */}
      <View style={styles.barsRow}>
        {visible.map((entry, i) => {
          const ratio = allSame ? 0.6 : (entry.value - min) / range;
          const heightPct = MIN_BAR_HEIGHT_PCT + ratio * (100 - MIN_BAR_HEIGHT_PCT);
          const isLast = i === lastIndex;
          return (
            <View key={entry.date} style={styles.barColumn}>
              {/* Value above bar (only for last for compactness) */}
              {isLast && (
                <Text style={styles.barValueLabel}>{entry.value.toFixed(1)}</Text>
              )}
              <View
                style={[
                  styles.bar,
                  { height: `${heightPct}%` },
                  isLast && styles.barLast,
                ]}
              />
              <Text style={styles.barDateLabel} numberOfLines={1}>
                {formatShortDate(entry.date, i18n.language)}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Bottom axis label */}
      <View style={styles.yAxisRow}>
        <Text style={styles.yAxisLabel}>{min.toFixed(1)} kg</Text>
        <View style={styles.gridLine} />
      </View>
    </View>
  );
}

function formatShortDate(iso: string, locale: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  // Compact "DD/MM" — works in all 5 supported locales
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  yAxisRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  yAxisLabel: {
    fontSize: 10,
    color: colors.textLight,
    fontWeight: '600',
    minWidth: 50,
  },
  gridLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.borderLight,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: CHART_HEIGHT,
    paddingHorizontal: spacing.xs,
    marginVertical: spacing.xs,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
    gap: 2,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: 4,
    backgroundColor: colors.primary + '60',
  },
  barLast: {
    backgroundColor: colors.primary,
  },
  barValueLabel: {
    position: 'absolute',
    top: -16,
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
  },
  barDateLabel: {
    fontSize: 9,
    color: colors.textLight,
    marginTop: 2,
  },
});
