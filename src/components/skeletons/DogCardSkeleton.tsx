import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from '../ui/Skeleton';
import { SkeletonGroup } from '../ui/SkeletonGroup';
import { colors, spacing, borderRadius } from '../../theme';

function DogCardRow() {
  return (
    <View style={styles.card}>
      <Skeleton width={72} height={72} borderRadius={36} />
      <View style={styles.body}>
        <Skeleton width="50%" height={18} />
        <Skeleton width="35%" height={12} style={{ marginTop: 6 }} />
        <View style={styles.row}>
          <Skeleton width={56} height={20} borderRadius={borderRadius.full} />
          <Skeleton width={56} height={20} borderRadius={borderRadius.full} />
        </View>
      </View>
    </View>
  );
}

export function DogCardSkeleton({ count = 2 }: { count?: number }) {
  return <SkeletonGroup count={count} renderItem={() => <DogCardRow />} />;
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
  row: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
});
