import React from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import { spacing } from '../../theme';

interface SkeletonGroupProps {
  count: number;
  /** A function that returns the skeleton for a single row, given its index. */
  renderItem: (index: number) => React.ReactNode;
  /** Vertical gap between rows. Defaults to `spacing.sm`. */
  gap?: number;
  style?: ViewStyle;
}

/**
 * Stacks N copies of a skeleton row, useful for list/grid placeholders. Pairs
 * with the existing `Skeleton` primitive — composers pass any layout they like
 * via `renderItem`, this just handles the `count` + `gap` plumbing.
 */
export function SkeletonGroup({ count, renderItem, gap = spacing.sm, style }: SkeletonGroupProps) {
  return (
    <View style={[styles.root, { gap }, style]}>
      {Array.from({ length: count }).map((_, i) => (
        <React.Fragment key={i}>{renderItem(i)}</React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
});
