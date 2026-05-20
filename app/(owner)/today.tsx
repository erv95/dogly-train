import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../src/contexts/AuthContext';
import { getDogsByOwner } from '../../src/services/dogs';
import DailyTipsRail from '../../src/components/DailyTipsRail';
import EmptyHint from '../../src/components/EmptyHint';
import { CoinBalancePill } from '../../src/components/CoinBalancePill';
import { Dog } from '../../src/types';
import { isPuppy } from '../../src/utils/dogAge';
import { colors, spacing, fontSize, fontFamily } from '../../src/theme';

/**
 * Today tab — the new puppy-parent hero (Iter 8.3).
 *
 * Single responsibility: load the owner's dogs, pick the "active" one
 * (prefers a puppy over an adult so puppy-mode copy applies), and render
 * DailyTipsRail with switcher chips. When the owner has no dog yet, shows
 * a puppy-flavoured empty state that routes to dog-form.
 *
 * Previously this rail lived inside home.tsx — moving it to its own tab
 * elevates the daily plan over the marketplace search, which now lives
 * in the "Buscar Pros" tab (the renamed home).
 */
export default function TodayScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { firebaseUser } = useAuth();
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [selectedDogId, setSelectedDogId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (cancelledRef: { current: boolean }) => {
    if (!firebaseUser) return;
    try {
      const list = await getDogsByOwner(firebaseUser.uid);
      if (cancelledRef.current) return;
      setDogs(list);
      // Prefer a puppy as the focused dog. Falls back to the first dog
      // for adult-only households.
      const puppy = list.find(isPuppy);
      setSelectedDogId((current) => current ?? puppy?.id ?? list[0]?.id ?? null);
    } catch (err) {
      console.error('TodayScreen load error:', err);
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [firebaseUser]);

  useFocusEffect(
    React.useCallback(() => {
      const cancelled = { current: false };
      load(cancelled);
      return () => { cancelled.current = true; };
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load({ current: false });
    setRefreshing(false);
  }, [load]);

  const selectedDog = dogs.find((d) => d.id === selectedDogId) ?? dogs[0];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('owner.todayTitle')}</Text>
        <CoinBalancePill />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? null : selectedDog ? (
          <DailyTipsRail
            dog={selectedDog}
            otherDogs={dogs.filter((d) => d.id !== selectedDog.id)}
            onChangeDog={setSelectedDogId}
          />
        ) : (
          <EmptyHint
            icon="paw"
            variant="puppy"
            title={t('owner.todayNoDogTitle')}
            body={t('owner.todayNoDogBody')}
            ctaLabel={t('owner.todayNoDogCta')}
            onCta={() => router.push('/(shared)/dog-form')}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { fontSize: fontSize.xxl, fontFamily: fontFamily.bold, color: colors.text, letterSpacing: -0.5 },
  scroll: { paddingBottom: spacing.xxl },
});
