import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View, Easing, useWindowDimensions } from 'react-native';

interface ConfettiProps {
  /** When this prop flips to true, the animation fires once. Reset it to false
   *  before the next trigger. */
  trigger: boolean;
  /** Total particles. */
  count?: number;
  /** Animation length per particle, ms. */
  duration?: number;
  /** Optional callback fired once after the animation finishes. */
  onDone?: () => void;
}

const COLORS = ['#F5A623', '#2D9CDB', '#10B981', '#EF4444', '#FFD700', '#8B5CF6'];

interface Particle {
  startX: number;
  driftX: number;
  delay: number;
  rotateTo: number;
  color: string;
  size: number;
}

/**
 * Self-contained confetti burst using RN's Animated API. Auto-unmounts the
 * particles after the animation finishes so it leaves no overhead.
 *
 * Use:
 * ```tsx
 * <Confetti trigger={justWon} onDone={() => setJustWon(false)} />
 * ```
 */
export function Confetti({ trigger, count = 80, duration = 1800, onDone }: ConfettiProps) {
  const [active, setActive] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;

  // useWindowDimensions so particles reflow on rotation / split-screen
  // instead of using stale values captured at module load.
  const { width, height } = useWindowDimensions();

  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: count }).map(() => ({
      startX: Math.random() * width,
      driftX: (Math.random() - 0.5) * 200,
      delay: Math.random() * 350,
      rotateTo: (Math.random() - 0.5) * 720,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 6 + Math.floor(Math.random() * 6),
    }));
  }, [count, width, active]);

  useEffect(() => {
    if (!trigger) return;
    setActive(true);
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: duration + 350,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      setActive(false);
      onDone?.();
    });
  }, [trigger]);

  if (!active) return null;

  return (
    <View pointerEvents="none" style={[styles.overlay, { width, height }]}>
      {particles.map((p, i) => {
        const translateY = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [-40, height + 40],
        });
        const translateX = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, p.driftX],
        });
        const rotate = progress.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', `${p.rotateTo}deg`],
        });
        const opacity = progress.interpolate({
          inputRange: [0, 0.85, 1],
          outputRange: [1, 1, 0],
        });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: p.startX,
              top: -20,
              width: p.size,
              height: p.size * 1.6,
              backgroundColor: p.color,
              borderRadius: 1,
              transform: [{ translateY }, { translateX }, { rotate }],
              opacity,
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 9999,
  },
});
