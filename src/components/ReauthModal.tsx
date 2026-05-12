import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth } from '../config/firebase';
import { colors, spacing, fontSize, borderRadius } from '../theme';

/** Local rate-limit policy. After MAX_ATTEMPTS wrong passwords within a single
 *  session, lock the modal for LOCKOUT_MS. Both counters are persisted in
 *  AsyncStorage keyed by uid so closing/reopening the app cannot bypass them.
 *
 *  Server-side rate-limit is separate (Firebase Auth already throttles after
 *  many failures with `auth/too-many-requests`). This is the *first* line of
 *  defence against a stolen-unlocked-phone scenario. */
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60_000; // 5 minutes

const FAILS_KEY = (uid: string) => `@reauth_fails_${uid}`;
const LOCK_KEY = (uid: string) => `@reauth_lockuntil_${uid}`;

interface Props {
  visible: boolean;
  /** Title shown at the top of the modal (e.g. "Confirma tu identidad"). */
  title: string;
  /** Brief explainer below the title (e.g. "Vamos a borrar tu cuenta..."). */
  body: string;
  /** Label for the confirm button (e.g. "Continuar", "Borrar cuenta"). */
  confirmLabel: string;
  /** When true, render the confirm button in destructive (red) style. */
  destructive?: boolean;
  /** Called after successful re-authentication. The action proceeds from here. */
  onSuccess: () => void;
  onCancel: () => void;
}

/**
 * Re-authentication gate for sensitive actions (delete account, change email,
 * change password). Forces the user to re-enter their password — even if
 * already logged in — so a stolen unlocked phone can't delete the account
 * with one tap.
 *
 * Pattern: Firebase requires re-auth for delete/email/password changes after
 * a session ages. We surface that requirement explicitly with our own
 * password input + reauthenticateWithCredential call.
 */
export function ReauthModal({
  visible, title, body, confirmLabel, destructive,
  onSuccess, onCancel,
}: Props) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  // Re-hydrate counters whenever the modal opens. Tied to uid so multiple
  // accounts on the same device do not share lockouts.
  useEffect(() => {
    if (!visible) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    (async () => {
      try {
        const [failsRaw, lockRaw] = await Promise.all([
          AsyncStorage.getItem(FAILS_KEY(uid)),
          AsyncStorage.getItem(LOCK_KEY(uid)),
        ]);
        const fails = failsRaw ? parseInt(failsRaw, 10) : 0;
        const lock = lockRaw ? parseInt(lockRaw, 10) : 0;
        setFailedAttempts(Number.isFinite(fails) ? fails : 0);
        // Already-expired lockouts → treat as unlocked.
        setLockedUntil(lock > Date.now() ? lock : null);
      } catch {
        // best-effort
      }
    })();
  }, [visible]);

  // Tick once a second while locked so the countdown updates.
  useEffect(() => {
    if (!visible || !lockedUntil) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [visible, lockedUntil]);

  // Cleanup on close.
  useEffect(() => {
    if (!visible) {
      setPassword('');
      setBusy(false);
      setShowPassword(false);
    }
  }, [visible]);

  const isLocked = !!(lockedUntil && lockedUntil > now);
  const remainingMs = isLocked ? (lockedUntil! - now) : 0;
  const remainingMinutes = Math.ceil(remainingMs / 60_000);
  const attemptsLeft = Math.max(0, MAX_ATTEMPTS - failedAttempts);

  const persistFailedAttempt = async (uid: string, attemptNumber: number) => {
    try {
      await AsyncStorage.setItem(FAILS_KEY(uid), String(attemptNumber));
      if (attemptNumber >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_MS;
        await AsyncStorage.setItem(LOCK_KEY(uid), String(until));
        setLockedUntil(until);
      }
    } catch {
      // best-effort
    }
  };

  const clearFailedAttempts = async (uid: string) => {
    try {
      await Promise.all([
        AsyncStorage.removeItem(FAILS_KEY(uid)),
        AsyncStorage.removeItem(LOCK_KEY(uid)),
      ]);
    } catch {
      // best-effort
    }
  };

  const handleConfirm = async () => {
    const user = auth.currentUser;
    if (!user || !user.email) {
      Alert.alert(t('common.error'), t('reauth.noUser'));
      return;
    }
    if (!password) return;
    if (isLocked) return;

    setBusy(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);
      // Success — wipe the local counters so future attempts start fresh.
      await clearFailedAttempts(user.uid);
      setFailedAttempts(0);
      setLockedUntil(null);
      onSuccess();
    } catch (e: any) {
      const code: string = e?.code ?? '';
      const isWrongPassword =
        code === 'auth/wrong-password' || code === 'auth/invalid-credential';

      if (isWrongPassword) {
        const next = failedAttempts + 1;
        setFailedAttempts(next);
        await persistFailedAttempt(user.uid, next);
        if (next >= MAX_ATTEMPTS) {
          Alert.alert(
            t('reauth.locked.title'),
            t('reauth.locked.body', { minutes: Math.ceil(LOCKOUT_MS / 60_000) }),
          );
        } else {
          Alert.alert(
            t('common.error'),
            `${t('reauth.wrongPassword')}\n${t('reauth.attemptsLeft', { count: MAX_ATTEMPTS - next })}`,
          );
        }
      } else {
        Alert.alert(t('common.error'), t('reauth.failed'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.iconCircle}>
            <Ionicons name="lock-closed" size={28} color={colors.primary} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>

          {isLocked && (
            <View style={styles.lockedBanner}>
              <Ionicons name="time-outline" size={16} color={colors.error} />
              <Text style={styles.lockedText}>
                {t('reauth.locked.body', { minutes: remainingMinutes })}
              </Text>
            </View>
          )}
          {!isLocked && failedAttempts > 0 && (
            <Text style={styles.attemptsText}>
              {t('reauth.attemptsLeft', { count: attemptsLeft })}
            </Text>
          )}

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder={t('reauth.passwordPlaceholder')}
              placeholderTextColor={colors.textLight}
              secureTextEntry={!showPassword}
              autoComplete="password"
              autoCapitalize="none"
              editable={!busy && !isLocked}
              autoFocus={!isLocked}
            />
            <TouchableOpacity onPress={() => setShowPassword((s) => !s)} hitSlop={8}>
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnSecondary]}
              onPress={onCancel}
              disabled={busy}
            >
              <Text style={styles.btnSecondaryText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.btn,
                destructive ? styles.btnDestructive : styles.btnPrimary,
                (!password || busy || isLocked) && styles.btnDisabled,
              ]}
              onPress={handleConfirm}
              disabled={!password || busy || isLocked}
            >
              {busy
                ? <ActivityIndicator color={colors.textOnPrimary} />
                : <Text style={styles.btnPrimaryText}>{confirmLabel}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  handle: {
    width: 36, height: 4, backgroundColor: colors.border, borderRadius: 2,
    alignSelf: 'center',
  },
  iconCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primary + '15',
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center',
  },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text, textAlign: 'center' },
  body: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
    gap: spacing.sm,
  },
  input: {
    flex: 1, paddingVertical: spacing.md, fontSize: fontSize.md, color: colors.text,
  },
  actions: { flexDirection: 'row', gap: spacing.sm },
  btn: {
    flex: 1, paddingVertical: spacing.md, borderRadius: borderRadius.full,
    alignItems: 'center', justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: colors.primary },
  btnDestructive: { backgroundColor: colors.error },
  btnPrimaryText: { color: colors.textOnPrimary, fontWeight: '800' },
  btnSecondary: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  btnSecondaryText: { color: colors.text, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },
  lockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.error + '15',
  },
  lockedText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.error,
    fontWeight: '600',
  },
  attemptsText: {
    fontSize: fontSize.sm,
    color: colors.warning,
    textAlign: 'center',
  },
});
