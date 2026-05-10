import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, borderRadius } from '../../theme';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({ width = '100%', height = 16, borderRadius: br = borderRadius.sm, style }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View
      style={[
        styles.bone,
        { width: width as any, height, borderRadius: br, opacity },
        style,
      ]}
    />
  );
}

/** Pre-built skeleton for a trainer/user card row */
export function SkeletonCard() {
  return (
    <View style={styles.card}>
      <Skeleton width={52} height={52} borderRadius={26} />
      <View style={styles.cardBody}>
        <Skeleton width="60%" height={14} />
        <Skeleton width="40%" height={12} style={{ marginTop: 6 }} />
        <Skeleton width="80%" height={12} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

/** Pre-built skeleton for a list of cards */
export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bone: {
    backgroundColor: colors.border,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardBody: {
    flex: 1,
    gap: 0,
  },
  list: {
    gap: 12,
    padding: 16,
  },
});
