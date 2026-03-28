import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signIn, signOut, resetPassword, resendVerificationEmail, getAuthErrorKey } from '../../src/services/auth';
import { useAuth } from '../../src/contexts/AuthContext';
import { Button, Input } from '../../src/components/ui';
import { colors, spacing, fontSize, borderRadius } from '../../src/theme';

export default function LoginScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { userData, role, initialized } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [awaitingAuth, setAwaitingAuth] = useState(false);

  // Navigate once AuthContext confirms user data is loaded
  useEffect(() => {
    if (!awaitingAuth || !initialized || !userData || !role) return;
    setLoading(false);
    setAwaitingAuth(false);
    if (role === 'owner') router.replace('/(owner)/home');
    else if (role === 'trainer') router.replace('/(trainer)/dashboard');
  }, [awaitingAuth, initialized, userData, role]);

  // Forgot password modal
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) return;

    setLoading(true);
    try {
      const credential = await signIn(email, password);
      if (!credential.user.emailVerified) {
        await signOut();
        setLoading(false);
        Alert.alert(
          'Email no verificado',
          'Revisa tu bandeja de entrada y confirma tu email antes de iniciar sesión.',
          [
            { text: 'OK', style: 'cancel' },
            {
              text: 'Reenviar correo',
              onPress: async () => {
                try {
                  await resendVerificationEmail(email, password);
                  Alert.alert('Correo enviado', 'Revisa tu bandeja de entrada.');
                } catch {
                  Alert.alert(t('common.error'), t('authErrors.generic'));
                }
              },
            },
          ]
        );
        return;
      }
      // Wait for AuthContext to load user data before navigating
      setAwaitingAuth(true);
    } catch (error: any) {
      setLoading(false);
      Alert.alert(t('common.error'), t(getAuthErrorKey(error)));
    }
  };

  const handleResetPassword = async () => {
    if (!resetEmail) return;

    setResetLoading(true);
    try {
      await resetPassword(resetEmail);
      Alert.alert(t('common.ok'), t('auth.resetPasswordSent'));
      setShowResetModal(false);
      setResetEmail('');
    } catch (error: any) {
      Alert.alert(t('common.error'), t(getAuthErrorKey(error)));
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={styles.title}>{t('auth.login')}</Text>

        <View style={styles.form}>
          <Input
            label={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <Input
            label={t('auth.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
          />

          <TouchableOpacity onPress={() => {
            setResetEmail(email);
            setShowResetModal(true);
          }}>
            <Text style={styles.forgotPassword}>
              {t('auth.forgotPassword')}
            </Text>
          </TouchableOpacity>

          <Button
            title={t('auth.login')}
            onPress={handleLogin}
            loading={loading}
            size="lg"
          />
        </View>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{t('auth.orContinueWith')}</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.socialButtons}>
          <Button
            title={t('auth.loginWith', { provider: 'Google' })}
            onPress={() => Alert.alert('', 'Disponible próximamente')}
            variant="outline"
          />
          <Button
            title={t('auth.loginWith', { provider: 'Apple' })}
            onPress={() => Alert.alert('', 'Disponible próximamente')}
            variant="outline"
          />
        </View>

        <TouchableOpacity
          style={styles.switchAuth}
          onPress={() => router.push('/(auth)/register')}
        >
          <Text style={styles.switchAuthText}>
            {t('auth.noAccount')}{' '}
            <Text style={styles.switchAuthLink}>{t('auth.register')}</Text>
          </Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>

      {/* Forgot Password Modal */}
      <Modal
        visible={showResetModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowResetModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('auth.resetPasswordTitle')}</Text>
            <Text style={styles.modalDesc}>{t('auth.resetPasswordDesc')}</Text>

            <Input
              label={t('auth.email')}
              value={resetEmail}
              onChangeText={setResetEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <View style={styles.modalButtons}>
              <Button
                title={t('common.cancel')}
                onPress={() => setShowResetModal(false)}
                variant="outline"
              />
              <Button
                title={t('auth.sendResetLink')}
                onPress={handleResetPassword}
                loading={resetLoading}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    padding: spacing.xl,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xl,
  },
  form: {
    gap: spacing.xs,
  },
  forgotPassword: {
    fontSize: fontSize.sm,
    color: colors.primary,
    textAlign: 'right',
    marginBottom: spacing.md,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginHorizontal: spacing.md,
  },
  socialButtons: {
    gap: spacing.sm,
  },
  switchAuth: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  switchAuthText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  switchAuthLink: {
    color: colors.primary,
    fontWeight: '600',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalContent: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  modalDesc: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
