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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import i18n from '../../src/config/i18n';
import { useAuth } from '../../src/contexts/AuthContext';
import { createUserProfile, signOut } from '../../src/services/auth';
import { Button, Input } from '../../src/components/ui';
import { colors, spacing, fontSize, borderRadius } from '../../src/theme';
import { UserRole } from '../../src/types';

type Step = 'role' | 'profile';

export default function CompleteProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { firebaseUser } = useAuth();
  const params = useLocalSearchParams<{ uid: string; email: string; displayName: string }>();

  // Prefer params (fresh OAuth flow) but fall back to the live Auth user
  // (resume flow from index.tsx when registration was interrupted earlier).
  const uid = params.uid || firebaseUser?.uid || '';
  const email = params.email || firebaseUser?.email || '';

  const [step, setStep] = useState<Step>('role');
  const [loading, setLoading] = useState(false);

  const [role, setRole] = useState<UserRole | null>(null);
  const [displayName, setDisplayName] = useState(params.displayName || firebaseUser?.displayName || '');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);

  const formatDateInput = (raw: string): string => {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  };

  const ddmmyyyyToISO = (display: string): string => {
    const parts = display.split('/');
    if (parts.length !== 3 || parts[2].length !== 4) return '';
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  };

  const validateAge = (dob: string): boolean => {
    const iso = ddmmyyyyToISO(dob);
    if (!iso) return false;
    const birth = new Date(iso);
    if (isNaN(birth.getTime())) return false;
    const today = new Date();
    const age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      return age - 1 >= 16;
    }
    return age >= 16;
  };

  const handleComplete = async () => {
    if (!displayName || !dateOfBirth || !role) return;

    if (!uid || !email) {
      // Should not happen — we got here without an Auth session. Send to login.
      Alert.alert(t('common.error'), t('authErrors.sessionExpired'), [
        { text: t('common.ok'), onPress: () => router.replace('/(auth)/login') },
      ]);
      return;
    }

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
      await createUserProfile({
        uid,
        email,
        displayName,
        role,
        dateOfBirth: ddmmyyyyToISO(dateOfBirth),
        language: i18n.language,
      });
      if (role === 'owner') router.replace('/(owner)/home');
      else if (role === 'caretaker') router.replace('/(caretaker)/dashboard');
      else router.replace('/(trainer)/dashboard');
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message || t('authErrors.generic'));
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    // Don't sign out — the user can return later and resume from index.tsx.
    // We just warn them so they understand the questionnaire isn't lost.
    Alert.alert(
      t('auth.completeLater'),
      t('auth.completeLaterDesc'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('auth.completeLaterLogout'),
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/(auth)/login');
          },
        },
      ],
    );
  };

  if (step === 'role') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.stepContent}>
          <Text style={styles.title}>{t('auth.completeProfile')}</Text>
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
            onPress={() => setStep('profile')}
            size="lg"
            disabled={!role}
          />
          <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => setStep('role')}>
            <Text style={styles.backLink}>{t('common.back')}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('auth.completeProfile')}</Text>

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

          <View style={styles.checkboxRow}>
            <Switch
              value={acceptTerms}
              onValueChange={setAcceptTerms}
              trackColor={{ true: colors.primary }}
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
              trackColor={{ true: colors.primary }}
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
            title={t('auth.completeProfile')}
            onPress={handleComplete}
            loading={loading}
            size="lg"
            disabled={!acceptTerms || !acceptPrivacy || !displayName || !dateOfBirth}
          />
        </ScrollView>
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
  cancelBtn: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
});
