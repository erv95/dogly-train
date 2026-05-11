import React, { useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth } from '../config/firebase';
import { colors, spacing, fontSize, borderRadius } from '../theme';

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

  React.useEffect(() => {
    if (!visible) {
      setPassword('');
      setBusy(false);
      setShowPassword(false);
    }
  }, [visible]);

  const handleConfirm = async () => {
    const user = auth.currentUser;
    if (!user || !user.email) {
      Alert.alert(t('common.error'), t('reauth.noUser'));
      return;
    }
    if (!password) return;

    setBusy(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);
      // Re-auth succeeded — let the caller proceed
      onSuccess();
    } catch (e: any) {
      const code: string = e?.code ?? '';
      const msg = code === 'auth/wrong-password' || code === 'auth/invalid-credential'
        ? t('reauth.wrongPassword')
        : t('reauth.failed');
      Alert.alert(t('common.error'), msg);
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
              editable={!busy}
              autoFocus
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
                (!password || busy) && styles.btnDisabled,
              ]}
              onPress={handleConfirm}
              disabled={!password || busy}
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
});
