import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/contexts/AuthContext';
import { Card } from '../src/components/ui';
import { SUPPORT_EMAIL } from '../src/config/contact';
import { colors, spacing, fontSize, borderRadius } from '../src/theme';

/**
 * Public transparency page. Lists every concrete security measure in plain
 * language so users (and competitors / regulators / the press) can see what
 * we actually do, not just buzzwords. Linked from Settings and from the
 * Welcome screen footer so prospective users can read it before signing up.
 *
 * Whenever you ship a new security feature, ADD A SECTION HERE — the value
 * of the page depends entirely on it staying current.
 */

interface MeasureRow {
  icon: keyof typeof Ionicons.glyphMap;
  titleKey: string;
  bodyKey: string;
}

const ACCOUNT_MEASURES: MeasureRow[] = [
  { icon: 'shield-checkmark-outline', titleKey: 'security.account.verifiedTitle', bodyKey: 'security.account.verifiedBody' },
  { icon: 'phone-portrait-outline', titleKey: 'security.account.sessionsTitle', bodyKey: 'security.account.sessionsBody' },
  { icon: 'lock-closed-outline', titleKey: 'security.account.reauthTitle', bodyKey: 'security.account.reauthBody' },
  { icon: 'time-outline', titleKey: 'security.account.softDeleteTitle', bodyKey: 'security.account.softDeleteBody' },
  { icon: 'mail-outline', titleKey: 'security.account.emailAlertsTitle', bodyKey: 'security.account.emailAlertsBody' },
];

const CHAT_MEASURES: MeasureRow[] = [
  { icon: 'eye-off-outline', titleKey: 'security.chat.piiTitle', bodyKey: 'security.chat.piiBody' },
  { icon: 'chatbubbles-outline', titleKey: 'security.chat.onPlatformTitle', bodyKey: 'security.chat.onPlatformBody' },
  { icon: 'flag-outline', titleKey: 'security.chat.reportTitle', bodyKey: 'security.chat.reportBody' },
];

const LOCATION_MEASURES: MeasureRow[] = [
  { icon: 'location-outline', titleKey: 'security.location.foregroundTitle', bodyKey: 'security.location.foregroundBody' },
  { icon: 'navigate-outline', titleKey: 'security.location.anonymizedTitle', bodyKey: 'security.location.anonymizedBody' },
  { icon: 'image-outline', titleKey: 'security.location.photoTitle', bodyKey: 'security.location.photoBody' },
];

const DATA_MEASURES: MeasureRow[] = [
  { icon: 'download-outline', titleKey: 'security.data.exportTitle', bodyKey: 'security.data.exportBody' },
  { icon: 'trash-outline', titleKey: 'security.data.deleteTitle', bodyKey: 'security.data.deleteBody' },
  { icon: 'person-circle-outline', titleKey: 'security.data.photoTitle', bodyKey: 'security.data.photoBody' },
  { icon: 'server-outline', titleKey: 'security.data.storageTitle', bodyKey: 'security.data.storageBody' },
];

function Section({ titleKey, measures }: { titleKey: string; measures: MeasureRow[] }) {
  const { t } = useTranslation();
  return (
    <View style={styles.sectionBlock}>
      <Text style={styles.sectionTitle}>{t(titleKey)}</Text>
      <Card style={styles.card}>
        {measures.map((m, idx) => (
          <View key={m.titleKey}>
            <View style={styles.row}>
              <View style={styles.iconWrap}>
                <Ionicons name={m.icon} size={20} color={colors.primary} />
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{t(m.titleKey)}</Text>
                <Text style={styles.rowBodyText}>{t(m.bodyKey)}</Text>
              </View>
            </View>
            {idx < measures.length - 1 && <View style={styles.divider} />}
          </View>
        ))}
      </Card>
    </View>
  );
}

export default function SecurityScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { firebaseUser } = useAuth();
  const supportEmail = SUPPORT_EMAIL;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name="shield-checkmark" size={40} color={colors.primary} />
        </View>
        <Text style={styles.heroTitle}>{t('security.heroTitle')}</Text>
        <Text style={styles.heroBody}>{t('security.heroBody')}</Text>
      </View>

      <Section titleKey="security.sectionAccount" measures={ACCOUNT_MEASURES} />
      <Section titleKey="security.sectionChat" measures={CHAT_MEASURES} />
      <Section titleKey="security.sectionLocation" measures={LOCATION_MEASURES} />
      <Section titleKey="security.sectionData" measures={DATA_MEASURES} />

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>{t('security.contactTitle')}</Text>
        <Card style={styles.card}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => Linking.openURL(`mailto:${supportEmail}?subject=Seguridad`)}
            activeOpacity={0.85}
          >
            <View style={styles.iconWrap}>
              <Ionicons name="mail-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{t('security.contactEmailTitle')}</Text>
              <Text style={styles.rowBodyText}>{supportEmail}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
          </TouchableOpacity>
          {firebaseUser && (
            <>
              <View style={styles.divider} />
              <TouchableOpacity
                style={styles.row}
                onPress={() => router.push('/(shared)/settings')}
                activeOpacity={0.85}
              >
                <View style={styles.iconWrap}>
                  <Ionicons name="settings-outline" size={20} color={colors.primary} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>{t('security.contactSettingsTitle')}</Text>
                  <Text style={styles.rowBodyText}>{t('security.contactSettingsBody')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
              </TouchableOpacity>
            </>
          )}
        </Card>
      </View>

      <Text style={styles.footer}>{t('security.footer')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    paddingBottom: spacing.xxl,
  },
  hero: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryLight + '33',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  heroTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  heroBody: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  sectionBlock: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  card: {
    padding: 0,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    gap: spacing.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight + '22',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  rowBody: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  rowBodyText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.md + 36 + spacing.sm,
  },
  footer: {
    fontSize: fontSize.xs,
    color: colors.textLight,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    lineHeight: 18,
  },
});
