import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { CHALLENGE_CATALOG_ORDER, CHALLENGE_COLORS, CHALLENGE_ICONS, CHALLENGE_TEMPLATES } from '../../../src/data/challengeTemplates';
import { getAllProgressForDog } from '../../../src/services/challenges';
import { ChallengeId, ChallengeProgress } from '../../../src/types';
import { useAuth } from '../../../src/contexts/AuthContext';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../../src/theme';

export default function ChallengesCatalogScreen() {
  const { dogId } = useLocalSearchParams<{ dogId: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { firebaseUser } = useAuth();

  const [progressMap, setProgressMap] = useState<Record<string, ChallengeProgress>>({});
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!firebaseUser || !dogId) { setLoading(false); return; }
      let cancelled = false;
      (async () => {
        try {
          const list = await getAllProgressForDog(dogId, firebaseUser.uid);
          if (cancelled) return;
          const m: Record<string, ChallengeProgress> = {};
          for (const p of list) m[p.templateId] = p;
          setProgressMap(m);
        } catch (e) {
          console.error('Error loading challenges progress', e);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => { cancelled = true; };
    }, [firebaseUser?.uid, dogId])
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: t('challenges.title') }} />
      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} size="large" />
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.intro}>{t('challenges.catalogIntro')}</Text>

          {CHALLENGE_CATALOG_ORDER.map((id) => {
            const tpl = CHALLENGE_TEMPLATES[id];
            const prog = progressMap[id];
            const completedCount = prog?.completions.length ?? 0;
            const pct = (completedCount / 30) * 100;
            const color = CHALLENGE_COLORS[id];
            return (
              <TouchableOpacity
                key={id}
                style={[styles.card, { borderLeftColor: color }]}
                onPress={() => router.push(`/(shared)/challenges/${id}?dogId=${dogId}`)}
                activeOpacity={0.85}
              >
                <View style={[styles.cardIcon, { backgroundColor: color + '20' }]}>
                  <Ionicons name={CHALLENGE_ICONS[id] as any} size={22} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.cardTopRow}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{t(`challenges.${id}.name`)}</Text>
                    {prog?.completed && (
                      <View style={[styles.badge, { backgroundColor: color + '20' }]}>
                        <Ionicons name="trophy" size={10} color={color} />
                        <Text style={[styles.badgeText, { color }]}>{t('challenges.completed')}</Text>
                      </View>
                    )}
                    {prog && !prog.completed && completedCount > 0 && (
                      <View style={[styles.badge, { backgroundColor: color + '15' }]}>
                        <Text style={[styles.badgeText, { color }]}>
                          {t('challenges.inProgress', { count: completedCount })}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.cardDesc} numberOfLines={2}>
                    {t(`challenges.${id}.description`)}
                  </Text>
                  <View style={styles.cardMetaRow}>
                    <View style={styles.metaPill}>
                      <Ionicons name="calendar-outline" size={11} color={colors.textSecondary} />
                      <Text style={styles.metaText}>{t('challenges.daysLabel', { count: 30 })}</Text>
                    </View>
                    <View style={styles.metaPill}>
                      <Ionicons name="trending-up-outline" size={11} color={colors.textSecondary} />
                      <Text style={styles.metaText}>{t(`challenges.difficulty.${tpl.difficulty}`)}</Text>
                    </View>
                  </View>
                  {prog && completedCount > 0 && (
                    <View style={styles.progressBarBg}>
                      <View style={[styles.progressBarFill, { width: `${pct}%`, backgroundColor: color }]} />
                    </View>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
              </TouchableOpacity>
            );
          })}

          <Text style={styles.footHint}>{t('challenges.footHint')}</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  loader: { flex: 1 },
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  intro: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.xs },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    borderLeftWidth: 4,
    ...shadow.sm,
  },
  cardIcon: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { flex: 1, fontSize: fontSize.md, fontWeight: '800', color: colors.text },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 6, paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  badgeText: { fontSize: 10, fontWeight: '800' },
  cardDesc: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2, lineHeight: 16 },
  cardMetaRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  metaPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 6, paddingVertical: 3,
    borderRadius: borderRadius.full,
    backgroundColor: colors.backgroundSecondary,
  },
  metaText: { fontSize: 10, color: colors.textSecondary, fontWeight: '700' },

  progressBarBg: {
    height: 4, borderRadius: 2,
    backgroundColor: colors.backgroundSecondary,
    overflow: 'hidden',
    marginTop: 8,
  },
  progressBarFill: { height: '100%', borderRadius: 2 },

  footHint: {
    fontSize: fontSize.xs, color: colors.textLight,
    textAlign: 'center', marginTop: spacing.sm,
  },
});
