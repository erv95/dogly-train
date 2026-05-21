import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../../src/config/firebase';
import {
  Dog,
  TrainingPrefs,
  DogAgeGroup,
  DogTrainingLevel,
  TrainingTime,
  TrainingGoal,
  DogIssue,
} from '../../../src/types';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../../src/theme';

// ─── Step definitions ────────────────────────────────────────────────────────

const AGE_OPTIONS: { value: DogAgeGroup; emoji: string }[] = [
  { value: 'puppy',  emoji: '🐶' },
  { value: 'young',  emoji: '🐕' },
  { value: 'adult',  emoji: '🦮' },
  { value: 'senior', emoji: '🐕‍🦺' },
];

const LEVEL_OPTIONS: { value: DogTrainingLevel; emoji: string }[] = [
  { value: 'beginner',     emoji: '🌱' },
  { value: 'basic',        emoji: '⭐' },
  { value: 'intermediate', emoji: '⭐⭐' },
  { value: 'advanced',     emoji: '⭐⭐⭐' },
];

const ISSUE_OPTIONS: { value: DogIssue; emoji: string }[] = [
  { value: 'aggression',  emoji: '😡' },
  { value: 'anxiety',     emoji: '😰' },
  { value: 'barking',     emoji: '🔊' },
  { value: 'pulling',     emoji: '🦮' },
  { value: 'fearful',     emoji: '🙈' },
  { value: 'destructive', emoji: '💥' },
  { value: 'other',       emoji: '❓' },
];

const TIME_OPTIONS: { value: TrainingTime; emoji: string }[] = [
  { value: 'short',  emoji: '⚡' },
  { value: 'medium', emoji: '⏱' },
  { value: 'long',   emoji: '🏆' },
];

const GOAL_OPTIONS: { value: TrainingGoal; emoji: string }[] = [
  { value: 'basic_obedience', emoji: '🎯' },
  { value: 'tricks',          emoji: '🎪' },
  { value: 'behavior',        emoji: '🛡️' },
  { value: 'socialization',   emoji: '🤝' },
];

const TOTAL_STEPS = 5;

export default function TrainingPrefsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const router = useRouter();
  const { dogId } = useLocalSearchParams<{ dogId: string }>();

  const [dog, setDog] = useState<Dog | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);

  // Answers (initialized from existing prefs if editing)
  const [ageGroup, setAgeGroup] = useState<DogAgeGroup | null>(null);
  const [currentLevel, setCurrentLevel] = useState<DogTrainingLevel | null>(null);
  const [issues, setIssues] = useState<DogIssue[]>([]);
  const [timeAvailable, setTimeAvailable] = useState<TrainingTime | null>(null);
  const [primaryGoal, setPrimaryGoal] = useState<TrainingGoal | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: t('plan.title') });
  }, [navigation, t]);

  // Load dog and prefill from existing prefs (or defaults derived from dog data)
  useEffect(() => {
    if (!dogId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'dogs', dogId));
        if (snap.exists()) {
          const d = { id: snap.id, ...snap.data() } as Dog;
          setDog(d);

          if (d.trainingPrefs) {
            // Editing existing prefs — prefill all answers
            setAgeGroup(d.trainingPrefs.ageGroup);
            setCurrentLevel(d.trainingPrefs.currentLevel);
            setIssues(d.trainingPrefs.issues);
            setTimeAvailable(d.trainingPrefs.timeAvailable);
            setPrimaryGoal(d.trainingPrefs.primaryGoal);
          } else {
            // First-time setup — derive sensible defaults from dog profile
            if (d.age <= 1) setAgeGroup('puppy');
            else if (d.age <= 3) setAgeGroup('young');
            else if (d.age <= 8) setAgeGroup('adult');
            else setAgeGroup('senior');
            if (Array.isArray(d.issues)) setIssues(d.issues);
          }
        }
      } catch (err) {
        console.error('Failed to load dog', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [dogId]);

  const canAdvance = (() => {
    switch (step) {
      case 0: return ageGroup !== null;
      case 1: return currentLevel !== null;
      case 2: return true; // issues is multi-select, can be empty
      case 3: return timeAvailable !== null;
      case 4: return primaryGoal !== null;
      default: return false;
    }
  })();

  const handleNext = async () => {
    if (!canAdvance) return;
    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1);
      return;
    }
    // Last step → save
    await handleSave();
  };

  const handleSave = async () => {
    if (!dogId || !ageGroup || !currentLevel || !timeAvailable || !primaryGoal) return;
    setSaving(true);
    try {
      const prefs: TrainingPrefs = {
        ageGroup,
        currentLevel,
        issues,
        timeAvailable,
        primaryGoal,
        completedAt: Timestamp.now(),
      };
      await updateDoc(doc(db, 'dogs', dogId), {
        trainingPrefs: prefs,
        updatedAt: Timestamp.now(),
      });
      // Navigate back to wherever we came from (cursos screen typically)
      router.back();
    } catch (err) {
      Alert.alert(t('common.error'), t('authErrors.generic'));
    } finally {
      setSaving(false);
    }
  };

  const toggleIssue = (issue: DogIssue) => {
    setIssues((prev) =>
      prev.includes(issue) ? prev.filter((i) => i !== issue) : [...prev, issue]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: spacing.xxl }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Progress bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${((step + 1) / TOTAL_STEPS) * 100}%` },
            ]}
          />
        </View>
        <Text style={styles.progressText}>{step + 1} / {TOTAL_STEPS}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Collapsible help — first-time users often don't know what to put.
            Tapping reveals 4 short bullets explaining the questionnaire intent. */}
        <TouchableOpacity
          style={styles.helpHeader}
          onPress={() => setHelpOpen((v) => !v)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('plan.howToFillTitle')}
        >
          <Ionicons name="help-circle-outline" size={18} color={colors.primary} />
          <Text style={styles.helpHeaderText}>{t('plan.howToFillTitle')}</Text>
          <Ionicons
            name={helpOpen ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.primary}
          />
        </TouchableOpacity>
        {helpOpen && (
          <View style={styles.helpBody}>
            {[1, 2, 3, 4].map((n) => (
              <View key={n} style={styles.helpRow}>
                <Text style={styles.helpBullet}>•</Text>
                <Text style={styles.helpText}>{t(`plan.howToFillBullet${n}`)}</Text>
              </View>
            ))}
          </View>
        )}

        {step === 0 && (
          <StepView
            question={t('plan.q_age')}
            subtitle={t('plan.q_age_sub')}
          >
            {AGE_OPTIONS.map((opt) => (
              <OptionButton
                key={opt.value}
                emoji={opt.emoji}
                label={t(`plan.age_${opt.value}`)}
                description={t(`plan.age_${opt.value}_desc`)}
                selected={ageGroup === opt.value}
                onPress={() => setAgeGroup(opt.value)}
              />
            ))}
          </StepView>
        )}

        {step === 1 && (
          <StepView
            question={t('plan.q_level')}
            subtitle={t('plan.q_level_sub')}
          >
            {LEVEL_OPTIONS.map((opt) => (
              <OptionButton
                key={opt.value}
                emoji={opt.emoji}
                label={t(`plan.level_${opt.value}`)}
                description={t(`plan.level_${opt.value}_desc`)}
                selected={currentLevel === opt.value}
                onPress={() => setCurrentLevel(opt.value)}
              />
            ))}
          </StepView>
        )}

        {step === 2 && (
          <StepView
            question={t('plan.q_issues')}
            subtitle={t('plan.q_issues_sub')}
          >
            {ISSUE_OPTIONS.map((opt) => (
              <OptionButton
                key={opt.value}
                emoji={opt.emoji}
                label={t(`dogs.issueOptions.${opt.value}`)}
                selected={issues.includes(opt.value)}
                onPress={() => toggleIssue(opt.value)}
                multi
              />
            ))}
            {issues.length === 0 && (
              <Text style={styles.skipHint}>{t('plan.q_issues_skip')}</Text>
            )}
          </StepView>
        )}

        {step === 3 && (
          <StepView
            question={t('plan.q_time')}
            subtitle={t('plan.q_time_sub')}
          >
            {TIME_OPTIONS.map((opt) => (
              <OptionButton
                key={opt.value}
                emoji={opt.emoji}
                label={t(`plan.time_${opt.value}`)}
                description={t(`plan.time_${opt.value}_desc`)}
                selected={timeAvailable === opt.value}
                onPress={() => setTimeAvailable(opt.value)}
              />
            ))}
          </StepView>
        )}

        {step === 4 && (
          <StepView
            question={t('plan.q_goal')}
            subtitle={t('plan.q_goal_sub')}
          >
            {GOAL_OPTIONS.map((opt) => (
              <OptionButton
                key={opt.value}
                emoji={opt.emoji}
                label={t(`plan.goal_${opt.value}`)}
                description={t(`plan.goal_${opt.value}_desc`)}
                selected={primaryGoal === opt.value}
                onPress={() => setPrimaryGoal(opt.value)}
              />
            ))}
          </StepView>
        )}
      </ScrollView>

      {/* Footer navigation */}
      <View style={styles.footer}>
        {step > 0 && (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setStep(step - 1)}
            disabled={saving}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color={colors.textSecondary} />
            <Text style={styles.backBtnText}>{t('common.back')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[
            styles.nextBtn,
            (!canAdvance || saving) && styles.nextBtnDisabled,
          ]}
          onPress={handleNext}
          disabled={!canAdvance || saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Text style={styles.nextBtnText}>
                {step === TOTAL_STEPS - 1 ? t('plan.finish') : t('common.next')}
              </Text>
              <Ionicons
                name={step === TOTAL_STEPS - 1 ? 'checkmark' : 'arrow-forward'}
                size={20}
                color="#fff"
              />
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Reusable subcomponents ─────────────────────────────────────────────────

function StepView({
  question,
  subtitle,
  children,
}: {
  question: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.stepContainer}>
      <Text style={styles.question}>{question}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      <View style={styles.optionsList}>{children}</View>
    </View>
  );
}

function OptionButton({
  emoji,
  label,
  description,
  selected,
  multi,
  onPress,
}: {
  emoji: string;
  label: string;
  description?: string;
  selected: boolean;
  multi?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.option, selected && styles.optionSelected]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text style={styles.optionEmoji}>{emoji}</Text>
      <View style={styles.optionTextWrap}>
        <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{label}</Text>
        {description && <Text style={styles.optionDesc}>{description}</Text>}
      </View>
      <View style={[styles.optionCheck, selected && styles.optionCheckSelected]}>
        {selected && (
          <Ionicons name={multi ? 'checkmark' : 'checkmark-circle'} size={18} color="#fff" />
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },

  // Progress
  progressContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  progressBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  progressText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textSecondary,
    minWidth: 32,
    textAlign: 'right',
  },

  // Content
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },

  // Help expandable
  helpHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.primary + '0E',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary + '30',
    marginBottom: spacing.md,
  },
  helpHeaderText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '700',
  },
  helpBody: {
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.primary + '08',
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  helpRow: { flexDirection: 'row', gap: spacing.xs },
  helpBullet: { color: colors.primary, fontWeight: '900', width: 12 },
  helpText: { flex: 1, fontSize: fontSize.xs, color: colors.text, lineHeight: 18 },

  stepContainer: { gap: spacing.md },
  question: {
    fontSize: fontSize.xxl,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  optionsList: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.md,
    borderWidth: 2,
    borderColor: colors.border,
  },
  optionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '08',
  },
  optionEmoji: { fontSize: 28 },
  optionTextWrap: { flex: 1, gap: 2 },
  optionLabel: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  optionLabelSelected: { color: colors.primary },
  optionDesc: { fontSize: fontSize.xs, color: colors.textSecondary, lineHeight: 16 },
  optionCheck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionCheckSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  skipHint: {
    fontSize: fontSize.xs,
    color: colors.textLight,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: spacing.sm,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textSecondary },
  nextBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    ...shadow.sm,
  },
  nextBtnDisabled: { backgroundColor: colors.textLight, ...shadow.sm },
  nextBtnText: { fontSize: fontSize.md, fontWeight: '800', color: '#fff' },
});
