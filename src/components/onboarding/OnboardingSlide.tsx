import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, fontFamily } from '../../theme';

interface Props {
  /** Ionicons name used as placeholder icon. Will be replaced with Lottie when
   *  the .json files land in `assets/lottie/`. */
  icon: keyof typeof Ionicons.glyphMap;
  /** Background tint behind the icon — keeps each slide visually distinct. */
  tint: string;
  title: string;
  subtitle: string;
  /** True when the slide is currently visible — gates the entrance animation
   *  so it only plays once you actually scroll to it. */
  active: boolean;
}

/**
 * Single onboarding slide. Centered icon + title + subtitle with a gentle
 * scale-in + bobbing animation. Designed so the API stays the same when we
 * later swap the Ionicon for `<LottieView source={require(...)} autoPlay loop />`.
 */
export function OnboardingSlide({ icon, tint, title, subtitle, active }: Props) {
  const scale = useRef(new Animated.Value(0.85)).current;
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return;
    Animated.spring(scale, {
      toValue: 1,
      friction: 6,
      tension: 80,
      useNativeDriver: true,
    }).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active]);

  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });

  return (
    <View style={styles.slide}>
      <View style={styles.illustrationWrap}>
        <View style={[styles.illustrationBg, { backgroundColor: tint }]} />
        <Animated.View style={{ transform: [{ scale }, { translateY }] }}>
          <Ionicons name={icon} size={140} color={colors.primary} />
        </Animated.View>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  illustrationWrap: {
    width: 240,
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustrationBg: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    opacity: 0.3,
  },
  title: {
    fontSize: fontSize.xxl,
    fontFamily: fontFamily.bold,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.md,
  },
});
