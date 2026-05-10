import React, { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { ProtocolId } from '../../../src/types';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../../src/theme';

const VALID_IDS: ProtocolId[] = ['choking', 'bleeding', 'poisoning', 'heat_stroke', 'seizures', 'cpr'];

const PROTOCOL_META: Record<ProtocolId, { emoji: string; tint: string }> = {
  choking:     { emoji: '😮‍💨', tint: '#EF4444' },
  bleeding:    { emoji: '🩸',   tint: '#DC2626' },
  poisoning:   { emoji: '☠️',   tint: '#7C3AED' },
  heat_stroke: { emoji: '🥵',   tint: '#F97316' },
  seizures:    { emoji: '⚡',    tint: '#F59E0B' },
  cpr:         { emoji: '🫀',   tint: '#E11D48' },
};

export default function EmergencyProtocolScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const protocolId = (VALID_IDS as string[]).includes(id ?? '') ? (id as ProtocolId) : null;
  const meta = protocolId ? PROTOCOL_META[protocolId] : null;

  useEffect(() => {
    navigation.setOptions({
      title: protocolId ? t(`emergency.protocols.${protocolId}.title`) : t('emergency.title'),
    });
  }, [navigation, t, protocolId]);

  const sections = useMemo(() => {
    if (!protocolId) return null;
    const arr = (key: string): string[] => {
      const v = t(`emergency.protocols.${protocolId}.${key}`, { returnObjects: true, defaultValue: [] as any });
      return Array.isArray(v) ? (v as string[]) : [];
    };
    return {
      subtitle: t(`emergency.protocols.${protocolId}.subtitle`),
      signs: arr('signs'),
      steps: arr('steps'),
      dontDo: arr('dontDo'),
      whenToCallVet: t(`emergency.protocols.${protocolId}.whenToCallVet`),
    };
  }, [protocolId, t]);

  const handleBackToEmergency = () => router.replace('/(shared)/emergency');

  const handleCall112 = async () => {
    const phone = t('emergency.universalPhones.emergency').replace(/[^\d+]/g, '');
    const url = `tel:${phone}`;
    // Skip canOpenURL: in Expo Go (Android) it returns false even when the
    // dialer is available. openURL will throw if it can't actually open.
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(t('common.error'), t('emergency.callNotAvailable'));
    }
  };

  if (!protocolId || !meta || !sections) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.notFound}>
          <Ionicons name="alert-circle" size={48} color={colors.textLight} />
          <Text style={styles.notFoundText}>{t('common.error')}</Text>
          <TouchableOpacity onPress={handleBackToEmergency}>
            <Text style={styles.backLink}>{t('common.back')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: meta.tint + '15', borderColor: meta.tint + '40' }]}>
          <View style={[styles.heroIcon, { backgroundColor: meta.tint }]}>
            <Text style={styles.heroEmoji}>{meta.emoji}</Text>
          </View>
          <Text style={styles.heroTitle}>{t(`emergency.protocols.${protocolId}.title`)}</Text>
          <Text style={styles.heroSubtitle}>{sections.subtitle}</Text>
        </View>

        {/* Signs of alarm */}
        {sections.signs.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="warning" size={18} color={colors.error} />
              <Text style={styles.sectionTitle}>{t('emergency.protocols.signsLabel')}</Text>
            </View>
            {sections.signs.map((s, i) => (
              <View key={i} style={styles.signRow}>
                <View style={[styles.signDot, { backgroundColor: colors.error }]} />
                <Text style={styles.signText}>{s}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Steps */}
        {sections.steps.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="list" size={18} color={meta.tint} />
              <Text style={styles.sectionTitle}>{t('emergency.protocols.stepsLabel')}</Text>
            </View>
            {sections.steps.map((s, i) => (
              <View key={i} style={styles.stepCard}>
                <View style={[styles.stepNumber, { backgroundColor: meta.tint }]}>
                  <Text style={styles.stepNumberText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{s}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Don't do */}
        {sections.dontDo.length > 0 && (
          <View style={[styles.section, styles.dontDoSection]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="close-circle" size={18} color={colors.error} />
              <Text style={[styles.sectionTitle, { color: colors.error }]}>
                {t('emergency.protocols.dontDoLabel')}
              </Text>
            </View>
            {sections.dontDo.map((s, i) => (
              <View key={i} style={styles.dontDoRow}>
                <Text style={styles.dontDoIcon}>❌</Text>
                <Text style={styles.dontDoText}>{s}</Text>
              </View>
            ))}
          </View>
        )}

        {/* When to call vet */}
        {sections.whenToCallVet && (
          <View style={styles.callBanner}>
            <Ionicons name="medkit" size={22} color="#fff" />
            <Text style={styles.callBannerText}>{sections.whenToCallVet}</Text>
          </View>
        )}

        {/* Sticky-feel emergency buttons */}
        <View style={styles.bottomActions}>
          <TouchableOpacity
            style={[styles.bottomBtn, { backgroundColor: colors.error }]}
            onPress={handleCall112}
            activeOpacity={0.85}
          >
            <Ionicons name="call" size={18} color="#fff" />
            <Text style={styles.bottomBtnText}>{t('emergency.protocols.call112')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.bottomBtn, { backgroundColor: colors.primary }]}
            onPress={handleBackToEmergency}
            activeOpacity={0.85}
          >
            <Ionicons name="people" size={18} color="#fff" />
            <Text style={styles.bottomBtnText}>{t('emergency.protocols.openContacts')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.disclaimerBox}>
          <Ionicons name="information-circle" size={16} color={colors.warning} />
          <Text style={styles.disclaimerText}>{t('emergency.disclaimer')}</Text>
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
  backLink: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '700', marginTop: spacing.md },

  hero: {
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    gap: spacing.sm,
  },
  heroIcon: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
    ...shadow.md,
  },
  heroEmoji: { fontSize: 36 },
  heroTitle: { fontSize: fontSize.xxl, fontWeight: '900', color: colors.text, textAlign: 'center' },
  heroSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },

  section: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dontDoSection: { borderColor: colors.error + '40', backgroundColor: colors.error + '08' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionTitle: { flex: 1, fontSize: fontSize.md, fontWeight: '800', color: colors.text },

  signRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 2 },
  signDot: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
  signText: { flex: 1, fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },

  stepCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  stepNumber: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stepNumberText: { color: '#fff', fontWeight: '800', fontSize: fontSize.sm },
  stepText: { flex: 1, fontSize: fontSize.sm, color: colors.text, lineHeight: 22 },

  dontDoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 2 },
  dontDoIcon: { fontSize: 14, marginTop: 2 },
  dontDoText: { flex: 1, fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },

  callBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.error,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    ...shadow.sm,
  },
  callBannerText: { flex: 1, color: '#fff', fontSize: fontSize.sm, fontWeight: '700', lineHeight: 20 },

  bottomActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  bottomBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    ...shadow.sm,
  },
  bottomBtnText: { color: '#fff', fontWeight: '800', fontSize: fontSize.sm },

  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.warning + '12',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.warning + '40',
    marginTop: spacing.sm,
  },
  disclaimerText: { flex: 1, fontSize: 12, color: colors.text, lineHeight: 18, fontStyle: 'italic' },
});
