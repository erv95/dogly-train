import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from '../ui/Skeleton';
import { SkeletonGroup } from '../ui/SkeletonGroup';
import { colors, spacing, borderRadius } from '../../theme';

function BookingCardRow() {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Skeleton width={48} height={48} borderRadius={24} />
        <View style={styles.headerText}>
          <Skeleton width="60%" height={14} />
          <Skeleton width="40%" height={12} style={{ marginTop: 6 }} />
        </View>
        <Skeleton width={70} height={22} borderRadius={borderRadius.full} />
      </View>
      <View style={styles.divider} />
      <View style={styles.footerRow}>
        <Skeleton width={120} height={12} />
        <Skeleton width={56} height={12} />
      </View>
    </View>
  );
}

export function BookingCardSkeleton({ count = 3 }: { count?: number }) {
  return <SkeletonGroup count={count} renderItem={() => <BookingCardRow />} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
