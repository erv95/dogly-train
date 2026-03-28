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
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import i18n from '../../src/config/i18n';
import { useAuth } from '../../src/contexts/AuthContext';
import { signUp, signOut, createUserProfile, getAuthErrorKey } from '../../src/services/auth';
import { Button, Input } from '../../src/components/ui';
import { colors, spacing, fontSize, borderRadius } from '../../src/theme';
import { UserRole } from '../../src/types';

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
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);

  const validateAge = (dob: string): boolean => {
    const birth = new Date(dob);
    const today = new Date();
    const age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      return age - 1 >= 16;
    }
    return age >= 16;
  };

  const validatePassword = (pwd: string): string | null => {
    if (pwd.length < 8) return 'Mínimo 8 caracteres';
    if (!/[A-Z]/.test(pwd)) return 'Debe incluir al menos una mayúscula';
    if (!/[0-9]/.test(pwd)) return 'Debe incluir al menos un número';
    if (!/[^A-Za-z0-9]/.test(pwd)) return 'Debe incluir al menos un símbolo (!@#$%...)';
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

    if (!validateAge(dateOfBirth)) {
      Alert.alert(t('common.error'), t('auth.ageError'));
      return;
    }

    if (!acceptTerms || !acceptPrivacy) {
      Alert.alert(t('common.error'), t('auth.termsRequired'));
      return;
    }

    setLoading(true);
    try {
      const credential = await signUp(email, password);
      await createUserProfile({
        uid: credential.user.uid,
        email,
        displayName,
        role: role!,
        dateOfBirth,
        language: i18n.language,
      });
      await signOut();
      Alert.alert(
        '¡Cuenta creada!',
        'Te hemos enviado un correo de verificación. Confirma tu email antes de iniciar sesión.',
        [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }]
      );
    } catch (error: any) {
      Alert.alert(t('common.error'), t(getAuthErrorKey(error)));
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
        onChangeText={setDateOfBirth}
        placeholder="YYYY-MM-DD"
        keyboardType={Platform.OS === 'ios' ? 'default' : 'default'}
      />

      <View style={styles.checkboxRow}>
        <Switch
          value={acceptTerms}
          onValueChange={setAcceptTerms}
          trackColor={{ true: colors.primary }}
        />
        <Text style={styles.checkboxLabel}>{t('auth.acceptTerms')}</Text>
      </View>

      <View style={styles.checkboxRow}>
        <Switch
          value={acceptPrivacy}
          onValueChange={setAcceptPrivacy}
          trackColor={{ true: colors.primary }}
        />
        <Text style={styles.checkboxLabel}>{t('auth.acceptPrivacy')}</Text>
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
});
