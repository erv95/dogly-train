import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../src/config/firebase';
import { Dog, DogIssue } from '../../../src/types';
import { BEHAVIOR_GUIDES, BehaviorGuideMeta, sortGuidesForDog } from '../../../src/data/behaviorGuides';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../../src/theme';

export default function BehaviorGuidesIndexScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const router = useRouter();
  const { dogId } = useLocalSearchParams<{ dogId?: string }>();

  const [dog, setDog] = useState<Dog | null>(null);
  const [loading, setLoading] = useState(!!dogId);

  useEffect(() => {
    navigation.setOptions({ title: t('guides.catalogTitle') });
  }, [navigation, t]);

  useEffect(() => {
    let cancelled = false;
    if (!dogId) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'dogs', dogId));
        if (!cancelled && snap.exists()) {
          setDog({ id: snap.id, ...snap.data() } as Dog);
        }
      } catch (err) {
        console.warn('Failed to load dog for guides', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [dogId]);

  const dogIssues: DogIssue[] = useMemo(
    () => (dog?.issues ?? []).filter((i) => i !== 'other'),
    [dog?.issues]
  );

  const orderedGuides = useMemo(
    () => sortGuidesForDog(dogIssues),
    [dogIssues]
  );

  const matchedSet = useMemo(() => new Set(dogIssues), [dogIssues]);
  const hasMatches = matchedSet.size > 0;

  const handlePressGuide = (g: BehaviorGuideMeta) => {
    router.push(`/(shared)/behavior-guides/${g.id}`);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: spacing.xxl }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.subtitle}>{t('guides.catalogSubtitle')}</Text>
          {dogId && !hasMatches && (
            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
              <Text style={styles.infoText}>{t('guides.noMatch')}</Text>
            </View>
          )}
        </View>

        {orderedGuides.map((g) => {
          const matched = matchedSet.has(g.id);
          return (
            <TouchableOpacity
              key={g.id}
              style={[styles.card, matched && { borderColor: g.color, borderWidth: 2 }]}
              onPress={() => handlePressGuide(g)}
              activeOpacity={0.85}
            >
              <View style={[styles.iconCircle, { backgroundColor: g.color + '22' }]}>
                <Text style={styles.iconEmoji}>{g.emoji}</Text>
              </View>
              <View style={styles.cardBody}>
                <View style={styles.titleRow}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {t(`guides.${g.id}.title`)}
                  </Text>
                  {matched && (
                    <View style={[styles.matchBadge, { backgroundColor: g.color }]}>
                      <Ionicons name="paw" size={10} color="#fff" />
                      <Text style={styles.matchBadgeText}>{t('guides.matchedBadge')}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.cardSubtitle} numberOfLines={2}>
                  {t(`guides.${g.id}.subtitle`)}
                </Text>
                <View style={styles.metaRow}>
                  <View style={[styles.severityDot, { backgroundColor: g.color }]} />
                  <Text style={styles.metaText}>
                    {t(`guides.severity.${g.severity}`)}
                  </Text>
                  <Text style={styles.metaDot}>·</Text>
                  <Ionicons name="time-outline" size={11} color={colors.textSecondary} />
                  <Text style={styles.metaText}>
                    {t('guides.estimatedReading', { minutes: 4 })}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
            </TouchableOpacity>
          );
        })}

        <Text style={styles.disclaimer}>{t('guides.disclaimer')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  scroll: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  header: { gap: spacing.sm, marginBottom: spacing.xs },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.primary + '10',
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  infoText: { flex: 1, fontSize: fontSize.xs, color: colors.text, lineHeight: 18 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  iconCircle: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
  },
  iconEmoji: { fontSize: 28 },
  cardBody: { flex: 1, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  cardTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.text, flexShrink: 1 },
  matchBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: borderRadius.full,
  },
  matchBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  cardSubtitle: { fontSize: fontSize.xs, color: colors.textSecondary, lineHeight: 16 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  severityDot: { width: 8, height: 8, borderRadius: 4 },
  metaText: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
  metaDot: { fontSize: 11, color: colors.textLight, marginHorizontal: 2 },
  disclaimer: {
    fontSize: 11,
    color: colors.textLight,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 16,
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
  },
});
