import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { getGuideById, GUIDE_SECTIONS } from '../../../src/data/behaviorGuides';
import { colors, spacing, fontSize, borderRadius } from '../../../src/theme';

const SECTION_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  intro: 'book-outline',
  whyHappens: 'help-circle-outline',
  whatToDo: 'checkmark-circle-outline',
  whatNotToDo: 'close-circle-outline',
  exercises: 'fitness-outline',
  whenToSeekHelp: 'medical-outline',
};

const SECTION_TINTS: Record<string, string> = {
  intro: '#6B7280',
  whyHappens: '#3B82F6',
  whatToDo: '#10B981',
  whatNotToDo: '#EF4444',
  exercises: '#F59E0B',
  whenToSeekHelp: '#8B5CF6',
};

export default function BehaviorGuideDetailScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { issueId } = useLocalSearchParams<{ issueId: string }>();
  const guide = getGuideById(issueId ?? '');

  useEffect(() => {
    navigation.setOptions({
      title: guide ? t(`guides.${guide.id}.title`) : t('guides.catalogTitle'),
    });
  }, [navigation, t, guide]);

  if (!guide) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.notFound}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.textLight} />
          <Text style={styles.notFoundText}>{t('common.error')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: guide.color + '15', borderColor: guide.color + '40' }]}>
          <View style={[styles.heroIcon, { backgroundColor: guide.color }]}>
            <Text style={styles.heroEmoji}>{guide.emoji}</Text>
          </View>
          <Text style={styles.heroTitle}>{t(`guides.${guide.id}.title`)}</Text>
          <Text style={styles.heroSubtitle}>{t(`guides.${guide.id}.subtitle`)}</Text>
          <View style={styles.heroBadgeRow}>
            <View style={[styles.severityBadge, { backgroundColor: guide.color }]}>
              <Text style={styles.severityBadgeText}>{t(`guides.severity.${guide.severity}`)}</Text>
            </View>
            <View style={styles.timeBadge}>
              <Ionicons name="time-outline" size={12} color={colors.textSecondary} />
              <Text style={styles.timeBadgeText}>{t('guides.estimatedReading', { minutes: 4 })}</Text>
            </View>
          </View>
        </View>

        {/* Sections */}
        {GUIDE_SECTIONS.map((section) => {
          const tint = SECTION_TINTS[section];
          return (
            <View key={section} style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIcon, { backgroundColor: tint + '22' }]}>
                  <Ionicons name={SECTION_ICONS[section]} size={18} color={tint} />
                </View>
                <Text style={styles.sectionTitle}>{t(`guides.sections.${section}`)}</Text>
              </View>
              <Text style={styles.sectionBody}>
                {t(`guides.${guide.id}.${section}`)}
              </Text>
            </View>
          );
        })}

        <View style={styles.disclaimerBox}>
          <Ionicons name="warning-outline" size={18} color={colors.warning} />
          <Text style={styles.disclaimerText}>{t('guides.disclaimer')}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  scroll: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  notFoundText: { color: colors.textSecondary, fontSize: fontSize.md, fontWeight: '600' },

  // Hero
  hero: {
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    gap: spacing.sm,
  },
  heroIcon: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  heroEmoji: { fontSize: 42 },
  heroTitle: { fontSize: fontSize.xxl, fontWeight: '900', color: colors.text, textAlign: 'center' },
  heroSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  heroBadgeRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  severityBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  severityBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  timeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timeBadgeText: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },

  // Section
  section: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.text, flex: 1 },
  sectionBody: { fontSize: fontSize.sm, color: colors.text, lineHeight: 22 },

  // Disclaimer
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.warning + '12',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.warning + '40',
    marginTop: spacing.sm,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 12,
    color: colors.text,
    lineHeight: 18,
    fontStyle: 'italic',
  },
});
