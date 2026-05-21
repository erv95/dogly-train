import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  ScrollView,
  Switch,
  Platform,
  KeyboardAvoidingView,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import i18n from '../../src/config/i18n';
import { useAuth } from '../../src/contexts/AuthContext';
import { signUp, signOut, createUserProfile, getAuthErrorKey } from '../../src/services/auth';
import { recordReferralSignup } from '../../src/services/referrals';
import { Button, Input } from '../../src/components/ui';
import { colors, spacing, fontSize, borderRadius } from '../../src/theme';
import { UserRole } from '../../src/types';
import { formatDateInput, ddmmyyyyToISO, validateUserBirthdate } from '../../src/utils/dateInput';

type Step = 'credentials' | 'role' | 'profile';

export default function RegisterScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { setUserData } = useAuth();

  const [step, setStep] = useState<Step>('credentials');
  const [loading, setLoading] = useState(false);

  // Credentials
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Role
  const [role, setRole] = useState<UserRole | null>(null);

  // Profile
  const [displayName, setDisplayName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);


  const validatePassword = (pwd: string): string | null => {
    if (pwd.length < 8) return t('authErrors.passwordMin8');
    if (!/[A-Z]/.test(pwd)) return t('authErrors.passwordUppercase');
    if (!/[0-9]/.test(pwd)) return t('authErrors.passwordNumber');
    if (!/[^A-Za-z0-9]/.test(pwd)) return t('authErrors.passwordSymbol');
    return null;
  };

  const handleNext = () => {
    if (step === 'credentials') {
      if (!email || !password || !confirmPassword) return;
      const pwdError = validatePassword(password);
      if (pwdError) {
        Alert.alert(t('common.error'), pwdError);
        return;
      }
      if (password !== confirmPassword) {
        Alert.alert(t('common.error'), t('authErrors.passwordsDoNotMatch'));
        return;
      }
      setStep('role');
    } else if (step === 'role') {
      if (!role) return;
      setStep('profile');
    }
  };

  const handleBack = () => {
    if (step === 'role') setStep('credentials');
    else if (step === 'profile') setStep('role');
  };

  const handleRegister = async () => {
    if (!displayName || !dateOfBirth) return;

    const ageErr = validateUserBirthdate(dateOfBirth);
    if (ageErr) {
      Alert.alert(t('common.error'), t(`auth.ageError_${ageErr}`, { defaultValue: t('auth.ageError') }));
      return;
    }

    if (!acceptTerms || !acceptPrivacy) {
      Alert.alert(t('common.error'), t('auth.termsRequired'));
      return;
    }

    // Capture the optional referral code as-is. We can't validate against
    // Firestore here because the user isn't authenticated yet (rules deny the
    // lookup). The server-side `recordReferralSignup` CF runs after auth and
    // silently no-ops if the code doesn't match a real user.
    const resolvedReferrer: string | null = referralCode.trim()
      ? referralCode.trim().toUpperCase()
      : null;

    setLoading(true);

    // Step 1: create the Auth credential. If this fails for "already in use",
    // route the user to login + offer password reset instead of leaving them
    // confused with a generic error.
    let credential;
    try {
      credential = await signUp(email, password);
    } catch (error: any) {
      setLoading(false);
      if (error?.code === 'auth/email-already-in-use') {
        Alert.alert(
          t('authErrors.emailAlreadyInUseTitle'),
          t('authErrors.emailAlreadyInUseDesc'),
          [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('auth.forgotPassword'), onPress: () => router.replace({ pathname: '/(auth)/login', params: { email } }) },
            { text: t('auth.login'), onPress: () => router.replace({ pathname: '/(auth)/login', params: { email } }) },
          ],
        );
      } else {
        Alert.alert(t('common.error'), t(getAuthErrorKey(error)));
      }
      return;
    }

    // Step 2: create the Firestore profile. If this fails (rules, network…),
    // the Auth credential already exists — instead of leaving the user with a
    // generic error and a half-account they can't recover, tell them they can
    // log in later to finish the questionnaire (index.tsx will resume them).
    try {
      await createUserProfile({
        uid: credential.user.uid,
        email,
        displayName,
        role: role!,
        dateOfBirth: ddmmyyyyToISO(dateOfBirth),
        language: i18n.language,
        referredBy: resolvedReferrer,
      });
      // Best-effort: register the referral with the caller's real IP so the
      // server can flag farms. Always runs before signOut so the auth token is
      // still valid. Logged on failure so we can diagnose silent referral
      // drops without surfacing the error to the user (signup already succeeded).
      if (resolvedReferrer) {
        try {
          await recordReferralSignup(resolvedReferrer);
        } catch (referralErr: any) {
          console.warn('recordReferralSignup failed:', referralErr?.code ?? referralErr?.message);
        }
      }
      await signOut();
      Alert.alert(
        t('authErrors.accountCreated'),
        t('authErrors.accountCreatedMsg'),
        [{ text: t('auth.login'), onPress: () => router.replace({ pathname: '/(auth)/login', params: { email } }) }]
      );
    } catch (error: any) {
      // Sign out to avoid leaving the user logged into a half-finished account
      // on this device, but the Auth credential remains in Firebase so they
      // can sign in later and the app will resume from complete-profile.
      await signOut().catch(() => {});
      Alert.alert(
        t('authErrors.profileSaveFailedTitle'),
        t('authErrors.profileSaveFailedDesc'),
        [{ text: t('common.ok'), onPress: () => router.replace({ pathname: '/(auth)/login', params: { email } }) }],
      );
    } finally {
      setLoading(false);
    }
  };

  const renderCredentialsStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.title}>{t('auth.register')}</Text>
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
      />
      <Input
        label={t('auth.confirmPassword')}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
      />
      <Button title={t('common.next')} onPress={handleNext} size="lg" />

      <TouchableOpacity
        style={styles.switchAuth}
        onPress={() => router.push('/(auth)/login')}
      >
        <Text style={styles.switchAuthText}>
          {t('auth.hasAccount')}{' '}
          <Text style={styles.switchAuthLink}>{t('auth.login')}</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderRoleStep = () => (
    <View style={styles.stepContent}>
      <TouchableOpacity onPress={handleBack}>
        <Text style={styles.backLink}>{t('common.back')}</Text>
      </TouchableOpacity>
      <Text style={styles.title}>{t('auth.selectRole')}</Text>
      <View style={styles.roleOptions}>
        <TouchableOpacity
          style={[styles.roleCard, role === 'owner' && styles.roleCardSelected]}
          onPress={() => setRole('owner')}
        >
          <Text style={styles.roleEmoji}>🐕</Text>
          <Text style={styles.roleTitle}>{t('auth.owner')}</Text>
          <Text style={styles.roleDesc}>{t('auth.ownerDesc')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.roleCard, role === 'trainer' && styles.roleCardSelected]}
          onPress={() => setRole('trainer')}
        >
          <Text style={styles.roleEmoji}>🎓</Text>
          <Text style={styles.roleTitle}>{t('auth.trainer')}</Text>
          <Text style={styles.roleDesc}>{t('auth.trainerDesc')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.roleCard, role === 'caretaker' && styles.roleCardSelected]}
          onPress={() => setRole('caretaker')}
        >
          <Text style={styles.roleEmoji}>🏠</Text>
          <Text style={styles.roleTitle}>{t('auth.caretaker')}</Text>
          <Text style={styles.roleDesc}>{t('auth.caretakerDesc')}</Text>
        </TouchableOpacity>
      </View>
      <Button
        title={t('common.next')}
        onPress={handleNext}
        size="lg"
        disabled={!role}
      />
    </View>
  );

  const renderProfileStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <TouchableOpacity onPress={handleBack}>
        <Text style={styles.backLink}>{t('common.back')}</Text>
      </TouchableOpacity>
      <Text style={styles.title}>{t('owner.profile')}</Text>
      <Input
        label={t('dogs.name')}
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="John Doe"
      />
      <Input
        label={t('auth.dateOfBirth')}
        value={dateOfBirth}
        onChangeText={(v) => setDateOfBirth(formatDateInput(v))}
        placeholder="DD/MM/YYYY"
        keyboardType="number-pad"
        maxLength={10}
      />

      <Input
        label={t('referrals.codeFieldLabel')}
        value={referralCode}
        onChangeText={(v) => setReferralCode(v.toUpperCase())}
        placeholder={t('referrals.codePlaceholder')}
        autoCapitalize="characters"
        maxLength={6}
      />
      <Text style={styles.referralHint}>{t('referrals.codeHint')}</Text>

      <View style={styles.checkboxRow}>
        <Switch
          value={acceptTerms}
          onValueChange={setAcceptTerms}
          trackColor={{ false: colors.border, true: colors.primary }}
        />
        <Text style={styles.checkboxLabel}>
          {t('legal.iAccept')}
          <Text
            style={styles.legalLink}
            onPress={() => Linking.openURL('https://dogly-train.web.app/terms-of-service')}
          >
            {t('legal.termsLink')}
          </Text>
        </Text>
      </View>

      <View style={styles.checkboxRow}>
        <Switch
          value={acceptPrivacy}
          onValueChange={setAcceptPrivacy}
          trackColor={{ false: colors.border, true: colors.primary }}
        />
        <Text style={styles.checkboxLabel}>
          {t('legal.iAccept')}
          <Text
            style={styles.legalLink}
            onPress={() => Linking.openURL('https://dogly-train.web.app/privacy-policy')}
          >
            {t('legal.privacyLink')}
          </Text>
        </Text>
      </View>

      <Button
        title={t('auth.register')}
        onPress={handleRegister}
        loading={loading}
        size="lg"
        disabled={!acceptTerms || !acceptPrivacy || !displayName || !dateOfBirth}
      />
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {step === 'credentials' && renderCredentialsStep()}
        {step === 'role' && renderRoleStep()}
        {step === 'profile' && renderProfileStep()}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  stepContent: {
    flex: 1,
    padding: spacing.xl,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xl,
  },
  backLink: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  roleOptions: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  roleCard: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  roleCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight + '20',
  },
  roleEmoji: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
  roleTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  roleDesc: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  legalLink: {
    color: colors.primary,
    fontWeight: '600',
    textDecorationLine: 'underline',
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
  referralHint: {
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
});
