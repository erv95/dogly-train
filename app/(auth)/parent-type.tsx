import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../src/contexts/AuthContext';
import { updateUserPreferences } from '../../src/services/users';
import { Button, ChoiceCard } from '../../src/components/ui';
import { colors, spacing, fontSize, fontFamily } from '../../src/theme';

/**
 * Parent-type capture screen (Iter 8.4). Owner-only, shown immediately
 * after complete-profile. Persists the choice to `User.preferences.parentType`
 * so the rest of the app can theme copy / tutorial steps / DailyTipsRail
 * recommendations accordingly.
 *
 * Three options:
 *  - puppy        → owner has a dog <12 months (the primary niche)
 *  - adult        → owner has an adult dog
 *  - considering  → no dog yet, just exploring
 *
 * Note: the per-dog `lifecycle` (computed from `Dog.birthdate`) is the
 * authoritative source for puppy-mode behavior in features that operate
 * on a specific dog. `parentType` is the user-level hint that drives the
 * initial onboarding copy and the tutorial cohort.
 */

type ParentType = 'puppy' | 'adult' | 'considering';

const OPTIONS: Array<{ value: ParentType; emoji: string; titleKey: string; descKey: string }> = [
  { value: 'puppy',       emoji: '🐶', titleKey: 'parentType.puppy.title',       descKey: 'parentType.puppy.desc' },
  { value: 'adult',       emoji: '🦮', titleKey: 'parentType.adult.title',       descKey: 'parentType.adult.desc' },
  { value: 'considering', emoji: '🔎', titleKey: 'parentType.considering.title', descKey: 'parentType.considering.desc' },
];

export default function ParentTypeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { firebaseUser, setUserData, userData } = useAuth();
  const [selected, setSelected] = useState<ParentType | null>(null);
  const [loading, setLoading] = useState(false);

  const handleContinue = async () => {
    if (!selected || !firebaseUser) return;
    setLoading(true);
    try {
      await updateUserPreferences(firebaseUser.uid, { parentType: selected });
      // Mirror in local AuthContext so the index gate doesn't bounce us
      // back here on the next re-render. Pattern identical to
      // complete-profile.tsx (Iter 7.3 bugfix).
      if (userData) {
        setUserData({
          ...userData,
          preferences: { ...(userData.preferences ?? {}), parentType: selected },
        });
      }
      router.replace('/');
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('authErrors.generic'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t('parentType.title')}</Text>
        <Text style={styles.subtitle}>{t('parentType.subtitle')}</Text>

        <View style={styles.options}>
          {OPTIONS.map((opt) => (
            <ChoiceCard
              key={opt.value}
              emoji={opt.emoji}
              title={t(opt.titleKey)}
              description={t(opt.descKey)}
              selected={selected === opt.value}
              onPress={() => setSelected(opt.value)}
            />
          ))}
        </View>

        <Button
          title={t('parentType.continue')}
          onPress={handleContinue}
          loading={loading}
          size="lg"
          disabled={!selected}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl, gap: spacing.md },
  title: {
    fontSize: fontSize.xxl,
    fontFamily: fontFamily.bold,
    color: colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  options: { gap: spacing.md, marginBottom: spacing.xl },
});
