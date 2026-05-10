import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from '../ui/Skeleton';
import { colors, spacing, borderRadius } from '../../theme';

export function ProfileSkeleton() {
  return (
    <View style={styles.container}>
      {/* Avatar + name */}
      <View style={styles.header}>
        <Skeleton width={96} height={96} borderRadius={48} />
        <Skeleton width={180} height={20} style={{ marginTop: spacing.md }} />
        <Skeleton width={120} height={14} style={{ marginTop: 6 }} />
      </View>

      {/* Stats strip */}
      <View style={styles.statsRow}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.statBox}>
            <Skeleton width={36} height={20} />
            <Skeleton width={60} height={12} style={{ marginTop: 4 }} />
          </View>
        ))}
      </View>

      {/* Bio block */}
      <View style={styles.section}>
        <Skeleton width={80} height={14} />
        <Skeleton width="100%" height={12} style={{ marginTop: spacing.sm }} />
        <Skeleton width="92%" height={12} style={{ marginTop: 6 }} />
        <Skeleton width="65%" height={12} style={{ marginTop: 6 }} />
      </View>

      {/* Reviews preview */}
      <View style={styles.section}>
        <Skeleton width={100} height={14} />
        {[0, 1].map((i) => (
          <View key={i} style={styles.reviewRow}>
            <Skeleton width={40} height={40} borderRadius={20} />
            <View style={styles.reviewBody}>
              <Skeleton width="40%" height={12} />
              <Skeleton width="90%" height={12} style={{ marginTop: 6 }} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  statBox: {
    alignItems: 'center',
    gap: 2,
  },
  section: {
    gap: spacing.sm,
  },
  reviewRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  reviewBody: {
    flex: 1,
  },
});
