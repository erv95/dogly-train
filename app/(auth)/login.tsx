import React, { useState, useEffect, useCallback } from 'react';
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { signIn, signOut, resetPassword, resendVerificationEmail, firebaseGoogleSignIn, userProfileExists, getAuthErrorKey } from '../../src/services/auth';
import { useAuth } from '../../src/contexts/AuthContext';
import { Button, Input } from '../../src/components/ui';
import { colors, spacing, fontSize, borderRadius } from '../../src/theme';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { firebaseUser, userData, role, initialized } = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();
  // Pre-fill email when arriving from a "your account already exists" prompt.
  const [email, setEmail] = useState(params.email || '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [awaitingAuth, setAwaitingAuth] = useState(false);

  // Navigate once AuthContext confirms user data is loaded.
  //
  // Three terminal states after a successful signIn:
  //   1. userData + role present → route to role's home.
  //   2. firebaseUser set but userData null → orphan account (Auth credential
  //      exists, Firestore doc was never written or got lost). Recover by
  //      sending the user to complete-profile so they finish registration —
  //      this matches what app/index.tsx does for the same condition. Without
  //      this branch the timeout below would fire a generic error and the
  //      user gets stuck unable to log in, forever.
  //   3. 10s passed with neither of the above → soft fail with generic alert.
  useEffect(() => {
    if (!awaitingAuth || !initialized) return;
    if (userData && role) {
      setLoading(false);
      setAwaitingAuth(false);
      // Route through `/` so the central index gate decides — handles the
      // owner parent-type one-shot capture (Iter 8.4) without duplicating
      // that condition here.
      router.replace('/');
      return;
    }
    if (firebaseUser && !userData) {
      setLoading(false);
      setAwaitingAuth(false);
      router.replace({
        pathname: '/(auth)/complete-profile',
        params: {
          uid: firebaseUser.uid,
          email: firebaseUser.email ?? '',
          displayName: firebaseUser.displayName ?? '',
        },
      });
      return;
    }
    // Timeout: if user data doesn't load within 10s, reset loading state
    const timeout = setTimeout(() => {
      if (awaitingAuth) {
        setLoading(false);
        setAwaitingAuth(false);
        Alert.alert(t('common.error'), t('authErrors.generic'));
      }
    }, 10000);
    return () => clearTimeout(timeout);
  }, [awaitingAuth, initialized, firebaseUser, userData, role]);

  // Google Sign-In
  const googleDiscovery = AuthSession.useAutoDiscovery('https://accounts.google.com');
  const [googleRequest, googleResponse, googlePromptAsync] = AuthSession.useAuthRequest(
    {
      clientId: '768086625029-vj1k0u5oagv0vg0o8r6a8s9lqk5c0g5h.apps.googleusercontent.com',
      scopes: ['openid', 'profile', 'email'],
      redirectUri: AuthSession.makeRedirectUri({ scheme: 'dogly-train' }),
      responseType: AuthSession.ResponseType.IdToken,
    },
    googleDiscovery
  );

  const handleGoogleAuth = useCallback(async (idToken: string) => {
    setLoading(true);
    try {
      const credential = await firebaseGoogleSignIn(idToken);
      const hasProfile = await userProfileExists(credential.user.uid);
      if (!hasProfile) {
        router.replace({ pathname: '/(auth)/complete-profile', params: {
          uid: credential.user.uid,
          email: credential.user.email || '',
          displayName: credential.user.displayName || '',
        }});
        setLoading(false);
        return;
      }
      setAwaitingAuth(true);
    } catch (error: any) {
      setLoading(false);
      Alert.alert(t('common.error'), t(getAuthErrorKey(error)));
    }
  }, [router, t]);

  useEffect(() => {
    if (googleResponse?.type === 'success') {
      const idToken = googleResponse.params.id_token;
      if (idToken) handleGoogleAuth(idToken);
    }
  }, [googleResponse, handleGoogleAuth]);

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
          t('authErrors.emailNotVerified'),
          t('authErrors.checkInboxVerify'),
          [
            { text: 'OK', style: 'cancel' },
            {
              text: t('authErrors.resendEmail'),
              onPress: async () => {
                try {
                  await resendVerificationEmail(email, password);
                  Alert.alert(t('authErrors.emailSent'), t('authErrors.checkInbox'));
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
            onPress={() => googlePromptAsync()}
            variant="outline"
            disabled={!googleRequest}
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
