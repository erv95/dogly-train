import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { signOut } from '../../src/services/auth';
import { restoreAccount } from '../../src/services/security';
import { exportMyData } from '../../src/services/dataExport';
import { showErrorAlert } from '../../src/utils/errors';
import { colors, spacing, fontSize, borderRadius } from '../../src/theme';

/**
 * Account is scheduled for deletion. Render-blocking screen until the user
 * either restores (cancels the soft-delete) or signs out (waits for the cron
 * to finish purging at the scheduled date).
 *
 * Reached from app/index.tsx when userData.status === 'pending_deletion'.
 */
export default function AccountPendingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { userData, setUserData } = useAuth();
  const [restoring, setRestoring] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportMyData();
      Alert.alert(
        t('accountPending.exportSuccessTitle'),
        t('accountPending.exportSuccessBody', { date: scheduledLabel }),
      );
    } catch (err) {
      showErrorAlert(err, 'accountPending.errors.unknown');
    } finally {
      setExporting(false);
    }
  };

  const scheduled = userData?.deletionScheduledFor?.toDate?.();
  const scheduledLabel = scheduled
    ? scheduled.toLocaleDateString(undefined, {
      day: 'numeric', month: 'long', year: 'numeric',
    })
    : '';

  const handleRestore = async () => {
    setRestoring(true);
    try {
      await restoreAccount();
      // Update local cache so the index gate routes us home
      if (userData) {
        setUserData({
          ...userData,
          status: 'active',
          deletionScheduledFor: null,
          deletionRequestedAt: null,
        });
      }
      Alert.alert(
        t('accountPending.restoredTitle'),
        t('accountPending.restoredBody', { context: userData?.gender === 'female' ? 'female' : '' }),
        [{ text: t('common.ok'), onPress: () => router.replace('/') }],
      );
    } catch (e: any) {
      const code = e?.message ?? 'unknown';
      const msg = code === 'grace_expired'
        ? t('accountPending.errors.grace_expired')
        : t('accountPending.errors.unknown');
      Alert.alert(t('common.error'), msg);
    } finally {
      setRestoring(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <View style={styles.iconCircle}>
          <Ionicons name="time-outline" size={48} color={colors.warning} />
        </View>
        <Text style={styles.title}>{t('accountPending.title')}</Text>
        <Text style={styles.message}>
          {t('accountPending.body', { date: scheduledLabel })}
        </Text>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.infoText}>{t('accountPending.info')}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary, restoring && styles.btnDisabled]}
          onPress={handleRestore}
          disabled={restoring}
          activeOpacity={0.85}
        >
          {restoring
            ? <ActivityIndicator color={colors.textOnPrimary} />
            : <Text style={styles.btnPrimaryText}>{t('accountPending.restoreCta')}</Text>}
        </TouchableOpacity>

        {/* Last-chance export. Even mid-deletion, GDPR Art. 20 grants the
         * right to portability. We show this BEFORE "Sign out" so the user
         * sees it as a safety-net option. */}
        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary, exporting && styles.btnDisabled]}
          onPress={handleExport}
          disabled={exporting}
          activeOpacity={0.85}
        >
          {exporting
            ? <ActivityIndicator color={colors.text} />
            : <Text style={styles.btnSecondaryText}>{t('accountPending.exportCta')}</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary]}
          onPress={handleSignOut}
          activeOpacity={0.85}
        >
          <Text style={styles.btnSecondaryText}>{t('settings.logout')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, justifyContent: 'space-between' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingTop: spacing.xxl },
  iconCircle: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: colors.warning + '20',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.warning + '40',
  },
  title: {
    fontSize: fontSize.title,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  message: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.md,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  infoText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  actions: { gap: spacing.sm },
  btn: {
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { color: colors.textOnPrimary, fontWeight: '800', fontSize: fontSize.md },
  btnSecondary: { backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.border },
  btnSecondaryText: { color: colors.text, fontWeight: '700', fontSize: fontSize.md },
  btnDisabled: { opacity: 0.5 },
});
