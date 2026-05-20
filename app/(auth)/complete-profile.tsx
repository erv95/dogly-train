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
import { formatDateInput, ddmmyyyyToISO } from '../../src/utils/dateInput';

type Step = 'role' | 'profile';

export default function CompleteProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { firebaseUser, setUserData } = useAuth();
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
  const [gender, setGender] = useState<'female' | 'male' | 'unspecified'>('unspecified');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);

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
      const created = await createUserProfile({
        uid,
        email,
        displayName,
        role,
        dateOfBirth: ddmmyyyyToISO(dateOfBirth),
        language: i18n.language,
        gender,
      });
      // Hydrate AuthContext with the freshly-created profile BEFORE navigating.
      // Without this, userData stays null in context and the central index.tsx
      // gate bounces the user back to this screen on any subsequent re-render
      // (e.g. background→foreground), creating an infinite loop that survives
      // app restarts. Mirrors the pattern in account-pending.tsx (handleRestore).
      setUserData(created);
      // Route through '/' so the index gate makes the final routing decision
      // based on the (now populated) userData — single source of truth.
      router.replace('/');
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

          {/* Gender — used only to inflect greetings (e.g. "Bienvenida, Alicia").
              Never shown to other users. The 3rd option keeps the masculine
              generic, matching standard Spanish convention. */}
          <Text style={styles.fieldLabel}>{t('auth.genderLabel')}</Text>
          <View style={styles.genderRow}>
            {(['female', 'male', 'unspecified'] as const).map((g) => {
              const selected = gender === g;
              return (
                <TouchableOpacity
                  key={g}
                  style={[styles.genderBtn, selected && styles.genderBtnSelected]}
                  onPress={() => setGender(g)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.genderBtnText, selected && styles.genderBtnTextSelected]}>
                    {t(`auth.gender_${g}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

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
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  genderRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  genderBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  genderBtnSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight + '20',
  },
  genderBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  genderBtnTextSelected: {
    color: colors.primary,
    fontWeight: '800',
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
