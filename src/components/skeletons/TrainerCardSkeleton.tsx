import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from '../ui/Skeleton';
import { SkeletonGroup } from '../ui/SkeletonGroup';
import { colors, spacing, borderRadius } from '../../theme';

function TrainerCardRow() {
  return (
    <View style={styles.card}>
      <Skeleton width={64} height={64} borderRadius={32} />
      <View style={styles.body}>
        <Skeleton width="65%" height={16} />
        <Skeleton width="40%" height={12} style={{ marginTop: 6 }} />
        <View style={styles.metaRow}>
          <Skeleton width={60} height={20} borderRadius={borderRadius.full} />
          <Skeleton width={48} height={20} borderRadius={borderRadius.full} />
        </View>
      </View>
    </View>
  );
}

export function TrainerCardSkeleton({ count = 4 }: { count?: number }) {
  return <SkeletonGroup count={count} renderItem={() => <TrainerCardRow />} />;
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  body: {
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
});
