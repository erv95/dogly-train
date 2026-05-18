import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, borderRadius, TABULAR_NUMS } from '../theme';

interface Props {
  data: Array<{ label: string; count: number }>;
  /** Optional override of the bar color. Defaults to theme primary. */
  barColor?: string;
}

/** Compact bar chart of monthly counts. Pure View-based — no svg dep needed.
 *  Each bar shows its count above and the month label below. The tallest bar
 *  fills the available height; others scale proportionally. Empty/zero bars
 *  render as a thin tray so the row never collapses to zero height. */
export default function BookingMonthlyChart({ data, barColor }: Props) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const color = barColor ?? colors.primary;

  return (
    <View style={styles.container}>
      <View style={styles.barsRow}>
        {data.map((d, i) => {
          const heightPct = max > 0 ? (d.count / max) * 100 : 0;
          // Always show at least a thin slab so empty months are visible.
          const visualHeight = d.count > 0 ? `${Math.max(8, heightPct)}%` : '4%';
          return (
            <View key={i} style={styles.barCol}>
              <Text style={styles.barCount}>{d.count > 0 ? d.count : ''}</Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.bar,
                    { height: visualHeight as any, backgroundColor: d.count > 0 ? color : colors.border },
                  ]}
                />
              </View>
              <Text style={styles.barLabel}>{d.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const CHART_HEIGHT = 110;

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: CHART_HEIGHT + 36,    // chart + count label + month label
    gap: 6,
  },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barCount: {
    fontSize: 10, fontWeight: '800', color: colors.text,
    fontVariant: TABULAR_NUMS,
    minHeight: 12,
  },
  barTrack: {
    width: '70%',
    height: CHART_HEIGHT,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 4,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    marginTop: 2,
  },
  bar: { width: '100%', borderRadius: 4 },
  barLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '700',
    marginTop: 4,
    textTransform: 'capitalize',
  },
});
