import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import {
  resendVerificationCurrentUser,
  reloadCurrentUser,
  signOut,
} from '../services/auth';
import { colors, spacing, fontSize, borderRadius } from '../theme';

const SNOOZE_KEY = '@dogly_email_verify_snooze_until';
const SNOOZE_DAYS = 7;

/**
 * Sticky banner asking the user to verify their email. Three primary actions:
 *   - Resend: send a new verification link
 *   - I verified: force-refresh the auth token and check emailVerified
 *   - Help (?): escape hatch — sign out / change account / snooze 7 days when
 *     the verification link gets stuck (common in Expo Go where dynamic links
 *     don't always propagate the verified flag back to the SDK).
 *
 * Auto-checks on app foreground (typical case: user tapped the link in their
 * mail app and is returning to Dogly Train).
 */
export default function EmailVerificationBanner() {
  const { t } = useTranslation();
  const router = useRouter();
  const { firebaseUser } = useAuth();

  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);
  // Local optimistic flag — hides the banner instantly if reload reports verified
  const [verifiedLocal, setVerifiedLocal] = useState<boolean>(!!firebaseUser?.emailVerified);
  // Snooze timestamp loaded from AsyncStorage (ms since epoch); null = not snoozed
  const [snoozedUntil, setSnoozedUntil] = useState<number | null>(null);

  // Load snooze flag once
  useEffect(() => {
    AsyncStorage.getItem(SNOOZE_KEY).then((v) => {
      const ts = v ? parseInt(v, 10) : 0;
      if (ts > Date.now()) setSnoozedUntil(ts);
      else if (v) AsyncStorage.removeItem(SNOOZE_KEY).catch(() => {});
    }).catch(() => {});
  }, []);

  // Auto-check when app foregrounds
  useEffect(() => {
    if (!firebaseUser || firebaseUser.emailVerified) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        reloadCurrentUser().then((isVerified) => {
          if (isVerified) {
            setVerifiedLocal(true);
            AsyncStorage.removeItem(SNOOZE_KEY).catch(() => {});
          }
        }).catch(() => {});
      }
    });
    return () => sub.remove();
  }, [firebaseUser?.uid, firebaseUser?.emailVerified]);

  // If context's firebaseUser changes verification, mirror it locally
  useEffect(() => {
    if (firebaseUser?.emailVerified) {
      setVerifiedLocal(true);
      AsyncStorage.removeItem(SNOOZE_KEY).catch(() => {});
    }
  }, [firebaseUser?.emailVerified]);

  const handleResend = useCallback(async () => {
    if (resending) return;
    setResending(true);
    try {
      await resendVerificationCurrentUser();
      Alert.alert(t('authErrors.emailSent'), t('authErrors.checkInbox'));
    } catch {
      Alert.alert(t('common.error'), t('authErrors.generic'));
    } finally {
      setResending(false);
    }
  }, [resending, t]);

  const handleCheck = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    try {
      const isVerified = await reloadCurrentUser();
      if (isVerified) {
        setVerifiedLocal(true);
        AsyncStorage.removeItem(SNOOZE_KEY).catch(() => {});
      } else {
        Alert.alert(
          t('emailVerification.notYetTitle'),
          t('emailVerification.notYetDesc'),
        );
      }
    } catch {
      Alert.alert(t('common.error'), t('authErrors.generic'));
    } finally {
      setChecking(false);
    }
  }, [checking, t]);

  const handleSnooze = useCallback(async () => {
    const until = Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000;
    await AsyncStorage.setItem(SNOOZE_KEY, String(until));
    setSnoozedUntil(until);
  }, []);

  const handleLogoutAndRetry = useCallback(async () => {
    try {
      await signOut();
      await AsyncStorage.removeItem(SNOOZE_KEY);
      router.replace('/(auth)/login');
    } catch {
      Alert.alert(t('common.error'), t('authErrors.generic'));
    }
  }, [router, t]);

  const handleHelp = useCallback(() => {
    Alert.alert(
      t('emailVerification.helpTitle'),
      t('emailVerification.helpDesc'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('emailVerification.helpResend'), onPress: handleResend },
        { text: t('emailVerification.helpLogout'), onPress: handleLogoutAndRetry },
        { text: t('emailVerification.helpSnooze'), onPress: handleSnooze, style: 'destructive' },
      ],
      { cancelable: true },
    );
  }, [t, handleResend, handleLogoutAndRetry, handleSnooze]);

  // Hide if verified, no user, or snoozed
  if (!firebaseUser || firebaseUser.emailVerified || verifiedLocal) return null;
  if (snoozedUntil && snoozedUntil > Date.now()) return null;

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="mail-unread" size={20} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>
          {t('emailVerification.title')}
        </Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          {t('emailVerification.subtitle', { email: firebaseUser.email ?? '' })}
        </Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={handleResend}
          disabled={resending}
          accessibilityRole="button"
          accessibilityLabel={t('emailVerification.resend')}
        >
          {resending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.actionText}>{t('emailVerification.resend')}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnPrimary]}
          onPress={handleCheck}
          disabled={checking}
          accessibilityRole="button"
          accessibilityLabel={t('emailVerification.iVerified')}
        >
          {checking ? (
            <ActivityIndicator color={colors.warning} size="small" />
          ) : (
            <Text style={[styles.actionText, styles.actionTextPrimary]}>
              {t('emailVerification.iVerified')}
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.helpBtn}
          onPress={handleHelp}
          accessibilityRole="button"
          accessibilityLabel={t('emailVerification.helpLabel')}
          hitSlop={8}
        >
          <Ionicons name="help-circle" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warning,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  iconWrap: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  title: { color: '#fff', fontWeight: '800', fontSize: fontSize.xs },
  subtitle: { color: '#fff', fontSize: 11, opacity: 0.95, marginTop: 1 },
  actions: { flexDirection: 'row', gap: 4, alignItems: 'center', flexShrink: 0 },
  actionBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    minWidth: 60,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  actionBtnPrimary: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  actionText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  actionTextPrimary: { color: colors.warning },
  helpBtn: {
    paddingHorizontal: 2,
    paddingVertical: 4,
  },
});
