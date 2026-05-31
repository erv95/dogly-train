import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ScrollView,
  TouchableOpacity,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { OnboardingSlide } from '../../src/components/onboarding/OnboardingSlide';
import { useHaptics } from '../../src/hooks/useHaptics';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../../src/theme';

const { width } = Dimensions.get('window');

// Icons re-themed in Iter 8.2 to match the puppy-parent positioning:
// (1) paw  = "your puppy in good hands"
// (2) calendar = "daily plan that grows with them"
// (3) school = "short courses"
// (4) medkit = "vaccines, weight, vet"
// (5) people = "pros when you need them"
const SLIDES = [
  { icon: 'paw' as const, tint: '#F5A62333', titleKey: 'onboarding.slide1.title', subtitleKey: 'onboarding.slide1.subtitle' },
  { icon: 'calendar-outline' as const, tint: '#2D9CDB33', titleKey: 'onboarding.slide2.title', subtitleKey: 'onboarding.slide2.subtitle' },
  { icon: 'school-outline' as const, tint: '#10B98133', titleKey: 'onboarding.slide3.title', subtitleKey: 'onboarding.slide3.subtitle' },
  { icon: 'medkit-outline' as const, tint: '#FFD70033', titleKey: 'onboarding.slide4.title', subtitleKey: 'onboarding.slide4.subtitle' },
  { icon: 'people-outline' as const, tint: '#F5A62333', titleKey: 'onboarding.slide5.title', subtitleKey: 'onboarding.slide5.subtitle' },
];

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const haptics = useHaptics();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);

  const isLast = page === SLIDES.length - 1;

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = e.nativeEvent.contentOffset.x;
    const newPage = Math.round(offset / width);
    if (newPage !== page) {
      setPage(newPage);
      haptics.tap();
    }
  };

  const goNext = () => {
    if (isLast) return finish();
    scrollRef.current?.scrollTo({ x: width * (page + 1), animated: true });
  };

  const finish = async () => {
    haptics.success();
    await AsyncStorage.setItem('@dogly_onboarded', '1');
    router.replace('/(auth)/welcome');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Skip — only meaningful before the last slide */}
      <View style={styles.topBar}>
        {!isLast ? (
          <TouchableOpacity onPress={finish} hitSlop={10}>
            <Text style={styles.skip}>{t('onboarding.skip')}</Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {SLIDES.map((s, i) => (
          <View key={i} style={{ width }}>
            <OnboardingSlide
              icon={s.icon}
              tint={s.tint}
              title={t(s.titleKey)}
              subtitle={t(s.subtitleKey)}
              active={i === page}
            />
          </View>
        ))}
      </ScrollView>

      {/* Page indicators */}
      <View style={styles.dotsRow}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === page && styles.dotActive]}
          />
        ))}
      </View>

      {/* Primary CTA */}
      <View style={styles.ctaWrap}>
        <TouchableOpacity style={styles.cta} onPress={goNext} activeOpacity={0.85}>
          <Text style={styles.ctaText}>
            {isLast ? t('onboarding.start') : t('onboarding.next')}
          </Text>
          {!isLast && <Ionicons name="arrow-forward" size={18} color={colors.textOnPrimary} />}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    height: 44,
  },
  skip: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 24,
  },
  ctaWrap: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  cta: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  ctaText: {
    color: colors.textOnPrimary,
    fontSize: fontSize.md,
    fontFamily: fontFamily.bold,
    fontWeight: '800',
  },
});
