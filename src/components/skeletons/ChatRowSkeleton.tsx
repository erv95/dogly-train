import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from '../ui/Skeleton';
import { SkeletonGroup } from '../ui/SkeletonGroup';
import { colors, spacing } from '../../theme';

function ChatRow() {
  return (
    <View style={styles.row}>
      <Skeleton width={52} height={52} borderRadius={26} />
      <View style={styles.body}>
        <View style={styles.topRow}>
          <Skeleton width="50%" height={14} />
          <Skeleton width={40} height={10} />
        </View>
        <Skeleton width="80%" height={12} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

export function ChatRowSkeleton({ count = 6 }: { count?: number }) {
  return <SkeletonGroup count={count} gap={0} renderItem={() => <ChatRow />} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  body: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
