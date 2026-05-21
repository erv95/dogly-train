import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  SafeAreaView as RNSafeAreaView,
  Animated,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../src/contexts/AuthContext';
import { getDogsByOwner } from '../../src/services/dogs';
import { isPuppy } from '../../src/utils/dogAge';
import EmptyHint from '../../src/components/EmptyHint';
import { getCourseProgress, markCourseCompleted, CourseProgress } from '../../src/services/courseProgress';
import {
  getDogStats,
  updateStatsOnCourseComplete,
  DogStats,
  LEVELS,
  XP_BY_DIFFICULTY,
  computeLevel,
  getLevelInfo,
  xpForNextLevel,
} from '../../src/services/dogStats';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../src/theme';
import LessonTimer from '../../src/components/LessonTimer';
import { rankCourses } from '../../src/services/courseRecommendations';
import { Dog } from '../../src/types';
import { doc as fsDoc, getDoc as fsGetDoc } from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import { COURSE_META, CourseMeta } from '../../src/data/courseMeta';
import { generateAndShareCertificate } from '../../src/services/certificate';

/**
 * Parse minutes from a localized duration string like "5 min" / "10 minutes" /
 * "5 минут" / "5分". Picks the first integer found. Defaults to 5 if none.
 */
function parseDurationMinutes(durationText: string): number {
  if (!durationText) return 5;
  const match = durationText.match(/\d+/);
  return match ? parseInt(match[0], 10) : 5;
}

// ─── Difficulty palette ───────────────────────────────────────────────────────

const DIFFICULTY_COLORS: Record<string, string> = {
  very_basic:   '#22C55E',
  basic:        '#84CC16',
  intermediate: '#F59E0B',
  advanced:     '#EF4444',
  expert:       '#8B5CF6',
};

const LEVEL_COLORS = ['#22C55E', '#84CC16', '#F59E0B', '#EF4444', '#8B5CF6'];

// ─── Types ────────────────────────────────────────────────────────────────────

interface Step {
  number: number;
  title: string;
  description: string;
  tip?: string;
  troubleshooting?: string;
}

interface TrainingMethod {
  id: string;
  title: string;
  description: string;
  bestFor: string;
  steps: Step[];
}

// Errors may be either a legacy string or the new structured form.
type CommonError = string | { error: string; cause: string; fix: string };

interface TroubleshootingItem { problem: string; solution: string; }
interface ProgressMilestone { stage: string; goal: string; }

interface Course {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
  level: string;
  difficulty: string;
  duration: string;
  location: string;
  objective: string;
  why: string[];
  where: string[];
  materials: string[];
  // Legacy steps (used when no methods array exists)
  steps: Step[];
  commonErrors: CommonError[];
  successSigns: string[];
  nextLevel: string;
  proTip: string;
  // ── New optional fields (rich format) ──────────────────────────────────────
  ageRecommendation?: string;
  estimatedSessions?: string;
  benefits?: string[];
  beforeYouStart?: string[];
  methods?: TrainingMethod[];
  troubleshooting?: TroubleshootingItem[];
  progressMilestones?: ProgressMilestone[];
  variations?: string[];
  safetyNotes?: string[];
  funFact?: string;
  meta?: CourseMeta;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DogCoursesScreen() {
  const { t } = useTranslation();
  const { firebaseUser } = useAuth();
  const router = useRouter();
  const { dogId: paramDogId, dogName } = useLocalSearchParams<{ dogId: string; dogName: string }>();

  // Owner-side entry point (no dogId param) auto-picks a dog so the screen
  // is useful from the Cursos tab too, not only when deep-linked from a
  // dog card. With multiple dogs we show a small chip picker; with one we
  // auto-select; with zero we render an EmptyHint.
  const [ownerDogs, setOwnerDogs] = useState<Dog[]>([]);
  const [autoDogId, setAutoDogId] = useState<string | null>(null);
  const [ownerDogsLoaded, setOwnerDogsLoaded] = useState(false);
  const effectiveDogId = paramDogId || autoDogId;

  // Track load error separately from "no dogs found" so we can show a
  // different message — confusing the user with "Add your puppy 🐶" when
  // they actually have dogs (just couldn't read them due to a permission /
  // index issue) was the bug they reported in Iter 8.5.
  const [loadError, setLoadError] = useState(false);

  // Use useFocusEffect so the dog list refreshes when the user comes back
  // from /(shared)/dog-form after creating their first puppy from the empty
  // state CTA. A plain useEffect only ran once on mount, leaving the empty
  // state stuck even after the dog was added.
  useFocusEffect(
    useCallback(() => {
      if (paramDogId) {
        setOwnerDogsLoaded(true);
        return;
      }
      if (!firebaseUser) return;
      let cancelled = false;
      (async () => {
        try {
          const list = await getDogsByOwner(firebaseUser.uid);
          if (cancelled) return;
          setOwnerDogs(list);
          if (list.length > 0) {
            // Preserve current selection if still valid, otherwise prefer a
            // puppy. This stops the chip jumping back to the first dog when
            // the screen refocuses with a different selection in flight.
            setAutoDogId((current) => {
              if (current && list.some((d) => d.id === current)) return current;
              const puppy = list.find(isPuppy);
              return puppy?.id ?? list[0].id;
            });
          }
          setLoadError(false);
        } catch (err) {
          console.warn('[courses-tab] getDogsByOwner failed:', err);
          if (!cancelled) setLoadError(true);
        } finally {
          if (!cancelled) setOwnerDogsLoaded(true);
        }
      })();
      return () => { cancelled = true; };
    }, [paramDogId, firebaseUser?.uid]),
  );

  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [progress, setProgress] = useState<Record<string, CourseProgress>>({});
  const [dogStats, setDogStats] = useState<DogStats | null>(null);
  const [dog, setDog] = useState<Dog | null>(null);
  const [levelUpVisible, setLevelUpVisible] = useState(false);
  const xpAnim = useState(new Animated.Value(0))[0];

  // Display name from params (deep-link), local dog (auto-pick), or empty.
  const decodedName = dogName
    ? decodeURIComponent(dogName)
    : (dog?.name ?? '');

  // ── Build courses ─────────────────────────────────────────────────────────────

  const buildCourse = (id: string, emoji: string, difficulty: string): Course => {
    // Helper: returns the translated array if it exists and is an array, else undefined.
    const arr = (key: string): any[] | undefined => {
      const v = t(`owner.coursesPage.${id}.${key}`, { returnObjects: true, defaultValue: null as any });
      return Array.isArray(v) ? v : undefined;
    };
    const str = (key: string): string | undefined => {
      const v = t(`owner.coursesPage.${id}.${key}`, { defaultValue: '' as any });
      return typeof v === 'string' && v.length > 0 ? v : undefined;
    };

    const stepsRaw = arr('steps') ?? [];
    const steps: Step[] = stepsRaw.map((s: any, i: number) => ({
      number: i + 1, title: s.title, description: s.description, tip: s.tip, troubleshooting: s.troubleshooting,
    }));

    const methodsRaw = arr('methods');
    const methods: TrainingMethod[] | undefined = methodsRaw?.map((m: any) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      bestFor: m.bestFor,
      steps: (m.steps ?? []).map((s: any, i: number) => ({
        number: i + 1, title: s.title, description: s.description, tip: s.tip, troubleshooting: s.troubleshooting,
      })),
    }));

    return {
      id, emoji, difficulty,
      title: t(`owner.coursesPage.${id}.title`),
      subtitle: t(`owner.coursesPage.${id}.subtitle`),
      level: t(`owner.coursesPage.${id}.level`),
      duration: t(`owner.coursesPage.${id}.duration`),
      location: t(`owner.coursesPage.${id}.location`),
      objective: t(`owner.coursesPage.${id}.objective`),
      why: arr('why') as string[] ?? [],
      where: arr('where') as string[] ?? [],
      materials: arr('materials') as string[] ?? [],
      steps,
      commonErrors: (arr('commonErrors') as CommonError[]) ?? [],
      successSigns: arr('successSigns') as string[] ?? [],
      nextLevel: t(`owner.coursesPage.${id}.nextLevel`),
      proTip: t(`owner.coursesPage.${id}.proTip`),
      // New optional fields
      ageRecommendation: str('ageRecommendation'),
      estimatedSessions: str('estimatedSessions'),
      benefits: arr('benefits') as string[] | undefined,
      beforeYouStart: arr('beforeYouStart') as string[] | undefined,
      methods,
      troubleshooting: arr('troubleshooting') as TroubleshootingItem[] | undefined,
      progressMilestones: arr('progressMilestones') as ProgressMilestone[] | undefined,
      variations: arr('variations') as string[] | undefined,
      safetyNotes: arr('safetyNotes') as string[] | undefined,
      funFact: str('funFact'),
      meta: COURSE_META[id],
    };
  };

  const COURSES: Course[] = [
    // Foundational (very_basic / basic)
    buildCourse('sit', '🐶', 'very_basic'),
    buildCourse('lie', '🐕', 'very_basic'),
    buildCourse('name', '🐶', 'very_basic'),
    buildCourse('come', '🏃', 'basic'),
    buildCourse('stay', '✋', 'basic'),
    buildCourse('leash', '🦮', 'basic'),
    buildCourse('leave_it', '🚫', 'basic'),
    buildCourse('fetch', '🎾', 'basic'),
    buildCourse('wait', '⏸️', 'basic'),
    // Intermediate
    buildCourse('paw', '🤝', 'intermediate'),
    buildCourse('place', '🛏️', 'intermediate'),
    buildCourse('settle', '😌', 'intermediate'),
    buildCourse('heel', '👣', 'intermediate'),
    buildCourse('shake', '👋', 'intermediate'),
    buildCourse('spin', '🌀', 'intermediate'),
    buildCourse('high_five', '🖐️', 'intermediate'),
    buildCourse('bow', '🙇', 'intermediate'),
    // Advanced
    buildCourse('distraction', '🎯', 'advanced'),
    buildCourse('drop', '🦴', 'advanced'),
    buildCourse('roll_over', '🔄', 'advanced'),
  ];

  // ── Load data ─────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!firebaseUser || !effectiveDogId) return;
    const [p, stats, dogSnap] = await Promise.all([
      getCourseProgress(firebaseUser.uid, effectiveDogId, COURSES.map((c) => c.id)),
      getDogStats(effectiveDogId).catch(() => null),
      fsGetDoc(fsDoc(db, 'dogs', effectiveDogId)).catch(() => null),
    ]);
    setProgress(p);
    // Always overwrite — not conditionally. Earlier code was `if (stats)
    // setDogStats(stats)` which left the previous dog's stats stuck when
    // the new dog had no stats doc yet (fresh dog). That produced the
    // "XP leaks across chips" bug. Same for `dog` itself.
    setDogStats(stats);
    setDog(dogSnap?.exists() ? ({ id: dogSnap.id, ...dogSnap.data() } as Dog) : null);
  }, [firebaseUser, effectiveDogId]);

  // Reload on focus (so changes from training-prefs questionnaire are
  // reflected when the user navigates back to this screen).
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // ALSO reload when the active dog changes (chip switcher on the tab).
  // useFocusEffect only re-fires when the screen refocuses — switching
  // chips happens within the same focus session, so without this effect
  // the previous dog's progress + stats remained visible.
  useEffect(() => { loadData(); }, [loadData]);

  // Animate XP bar when dogStats change. When dogStats becomes null
  // (e.g. switching the chip to a fresh dog with no progress yet) the
  // bar must reset to 0 — earlier the effect early-returned and left
  // the previous dog's filled bar visible.
  useEffect(() => {
    if (!dogStats) {
      // Snap to zero immediately so the switch doesn't show a stale fill.
      xpAnim.setValue(0);
      return;
    }
    const level = getLevelInfo(dogStats.level);
    const next = xpForNextLevel(dogStats.level);
    const isMax = next === Infinity;
    const pct = isMax ? 1 : (dogStats.xp - level.minXp) / (next - level.minXp);
    Animated.timing(xpAnim, {
      toValue: Math.min(Math.max(pct, 0), 1),
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [dogStats?.xp, dogStats?.level]);

  // ── Certificate generation ────────────────────────────────────────────────────

  const [generatingCert, setGeneratingCert] = useState(false);

  const handleGenerateCertificate = async () => {
    if (!dog || !dogStats || generatingCert) return;
    if ((dogStats.completedCourseIds?.length ?? 0) === 0) {
      Alert.alert(t('certificate.noCoursesTitle'), t('certificate.noCoursesDesc'));
      return;
    }
    setGeneratingCert(true);
    try {
      // Build localized course titles map (only for completed ones — keep payload small)
      const courseTitles: Record<string, string> = {};
      for (const id of dogStats.completedCourseIds ?? []) {
        courseTitles[id] = t(`owner.coursesPage.${id}.title`);
      }
      await generateAndShareCertificate({
        dog,
        stats: dogStats,
        photoDataUri: dog.photoURL ?? undefined,
        strings: {
          title: t('certificate.title'),
          subtitle: t('certificate.subtitle'),
          certifyText: t('certificate.certifyText'),
          hasCompleted: t('certificate.hasCompleted', { count: dogStats.completedCourseIds?.length ?? 0 }),
          withXp: t('certificate.withXp', { xp: dogStats.xp }),
          reachingLevel: t('certificate.reachingLevel', { level: dogStats.level }),
          levelName: t(`progress.levelNames.${dogStats.level}`),
          longestStreak: t('certificate.longestStreak', { count: dogStats.longestStreak }),
          coursesLabel: t('certificate.coursesLabel'),
          issuedOn: t('certificate.issuedOn', { date: new Date().toLocaleDateString() }),
          signatureLabel: t('certificate.signatureLabel'),
          signatureSubtitle: t('certificate.signatureSubtitle'),
          shareDialogTitle: t('certificate.shareDialogTitle'),
          courseTitles,
        },
      });
    } catch (err) {
      console.error('Certificate error', err);
      Alert.alert(t('common.error'), t('authErrors.generic'));
    } finally {
      setGeneratingCert(false);
    }
  };

  // ── Complete handler ──────────────────────────────────────────────────────────

  const handleComplete = async (courseId: string, difficulty: string) => {
    if (!firebaseUser || !effectiveDogId) return;

    const prevLevel = dogStats?.level ?? 1;
    const prevProgressEntry = progress[courseId];

    // Optimistic UI: mark progress immediately. If either write fails we
    // revert below so the user does not see a fake "completed" state.
    setProgress((prev) => ({
      ...prev,
      [courseId]: { ...prev[courseId], userId: firebaseUser.uid, dogId: effectiveDogId, courseId, completed: true } as CourseProgress,
    }));

    try {
      // Sequential: stats first (authoritative XP), then course_progress
      // (UI flag). If stats fails the UI flag never gets set; if progress
      // fails the user already got their XP and we recover on next reload.
      const newStats = await updateStatsOnCourseComplete(effectiveDogId, firebaseUser.uid, courseId, difficulty);
      await markCourseCompleted(firebaseUser.uid, effectiveDogId, courseId);

      setDogStats(newStats);

      if (newStats.level > prevLevel) {
        setLevelUpVisible(true);
        setTimeout(() => setLevelUpVisible(false), 3000);
      }
    } catch (e) {
      console.error('Error updating dog stats:', e);
      // Roll back the optimistic UI so the user sees what actually persisted
      setProgress((prev) => {
        const next = { ...prev };
        if (prevProgressEntry) next[courseId] = prevProgressEntry;
        else delete next[courseId];
        return next;
      });
      Alert.alert(t('owner.coursesPage.completeErrorTitle'), t('owner.coursesPage.completeErrorBody'));
    }
  };

  // ── Computed stats ────────────────────────────────────────────────────────────

  const completedCount = COURSES.filter((c) => progress[c.id]?.completed).length;
  // Always derive level from XP so stale stored level doesn't affect display
  const currentLevel = dogStats ? computeLevel(dogStats.xp) : 1;
  const level = getLevelInfo(currentLevel);
  const nextXp = xpForNextLevel(currentLevel);
  const isMaxLevel = nextXp === Infinity;
  const levelName = t(`progress.levelNames.${level.level}`);
  const levelColor = LEVEL_COLORS[level.level - 1] ?? colors.primary;

  // ── Render ────────────────────────────────────────────────────────────────────

  // When accessed from the (owner)/courses tab there's no useful back
  // destination — the user is "on" the tab. Hide the back button in that case.
  const isTabEntry = !paramDogId;

  // Empty-state takeover.
  // - If load actually failed (rules, network, missing index) AND we have
  //   no dogs in state, tell the user to retry rather than ask them to add
  //   a dog they may already have.
  // - Only when load succeeded AND truly returned zero dogs do we suggest
  //   adding the first puppy.
  if (isTabEntry && ownerDogsLoaded && ownerDogs.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.backBtn} />
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{`🎓 ${t('owner.coursesPage.title')}`}</Text>
          </View>
          <View style={styles.backBtn} />
        </View>
        {loadError ? (
          <EmptyHint
            icon="cloud-offline-outline"
            title={t('common.error')}
            body={t('authErrors.generic')}
            ctaLabel={t('common.retry')}
            onCta={() => {
              setLoadError(false);
              setOwnerDogsLoaded(false);
              // Re-fire the effect by toggling a state used in its deps. The
              // simplest is to flip ownerDogsLoaded — the effect's dep is
              // firebaseUser?.uid but on next render the load reruns thanks
              // to ownerDogsLoaded reset (the early return in the empty-state
              // branch above gates further renders).
            }}
          />
        ) : (
          <EmptyHint
            icon="paw"
            variant="puppy"
            title={t('empty.dogs.title')}
            body={t('empty.dogs.body')}
            ctaLabel={t('empty.dogs.cta')}
            onCta={() => router.push('/(shared)/dog-form')}
          />
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {isTabEntry ? (
          <View style={styles.backBtn} />
        ) : (
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
        )}
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {decodedName ? t('owner.coursesPage.coursesFor', { name: decodedName }) : `🎓 ${t('owner.coursesPage.title')}`}
          </Text>
        </View>
        {/* Certificate (only when dog has completed at least one course) */}
        {(dogStats?.completedCourseIds?.length ?? 0) > 0 && (
          <TouchableOpacity
            onPress={handleGenerateCertificate}
            style={styles.clickerHeaderBtn}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('certificate.shareDialogTitle')}
            disabled={generatingCert}
          >
            <Ionicons name={generatingCert ? 'hourglass-outline' : 'ribbon'} size={22} color={colors.primary} />
          </TouchableOpacity>
        )}
        {/* Quick clicker access */}
        <TouchableOpacity
          onPress={() => router.push('/(shared)/clicker')}
          style={styles.clickerHeaderBtn}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('clicker.title')}
        >
          <Ionicons name="radio-button-on" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Dog selector — only when accessed from the tab with multiple dogs.
          Switching the chip changes `autoDogId`, which feeds into
          `effectiveDogId` and re-triggers loadData. */}
      {isTabEntry && ownerDogs.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dogPickerRow}
        >
          {ownerDogs.map((d) => {
            const selected = d.id === effectiveDogId;
            // Fallback to a generic label when a dog doc somehow has no
            // name — prevents the row from looking like empty pills.
            const label = (d.name && d.name.trim()) || '🐶';
            return (
              <TouchableOpacity
                key={d.id}
                onPress={() => setAutoDogId(d.id)}
                activeOpacity={0.75}
                style={[styles.dogPickerChip, selected && styles.dogPickerChipSelected]}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.dogPickerChipText, selected && styles.dogPickerChipTextSelected]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* ── Stats panel ── */}
      <View style={styles.statsPanel}>
        {/* Level badge */}
        <View style={[styles.levelCard, { borderColor: levelColor + '40', backgroundColor: levelColor + '10' }]}>
          <Text style={styles.levelEmoji}>{level.emoji}</Text>
          <View>
            <Text style={[styles.levelNum, { color: levelColor }]}>
              {t('progress.level')} {level.level}
            </Text>
            <Text style={[styles.levelName, { color: levelColor }]}>{levelName}</Text>
          </View>
        </View>

        {/* XP + streak + completed */}
        <View style={styles.statsRight}>
          {/* XP bar */}
          <View style={styles.xpRow}>
            <Text style={styles.xpLabel}>
              ⚡ {dogStats?.xp ?? 0} {t('progress.xp')}
            </Text>
            <Text style={styles.xpHint}>
              {isMaxLevel
                ? t('progress.maxLevel')
                : t('progress.nextLevelXp', { xp: nextXp - (dogStats?.xp ?? 0) })}
            </Text>
          </View>
          <View style={styles.xpTrack}>
            <Animated.View
              style={[
                styles.xpFill,
                {
                  backgroundColor: levelColor,
                  width: xpAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>

          {/* Streak + completed pills. The streak label already includes
              `{{count}}` via i18n interpolation — don't prefix the number
              manually or it renders twice ("1 1 día"). */}
          <View style={styles.pillRow}>
            <View style={styles.pill}>
              <Text style={styles.pillIcon}>🔥</Text>
              <Text style={styles.pillText}>
                {t('progress.streakDays', { count: dogStats?.currentStreak ?? 0 })}
              </Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillIcon}>📚</Text>
              <Text style={styles.pillText}>
                {completedCount}/{COURSES.length} {t('progress.completed')}
              </Text>
            </View>
            {(dogStats?.longestStreak ?? 0) > 1 && (
              <View style={[styles.pill, styles.pillRecord]}>
                <Text style={styles.pillIcon}>🏅</Text>
                <Text style={styles.pillText}>
                  {t('progress.longestStreak', { count: dogStats!.longestStreak })}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Level-up toast */}
      {levelUpVisible && (
        <View style={styles.levelUpToast}>
          <Text style={styles.levelUpText}>
            🎉 {t('progress.levelUp')} {level.emoji} {levelName}
          </Text>
        </View>
      )}

      {(() => {
        // Compute ordered courses + which are "recommended"
        const completedIds = dogStats?.completedCourseIds ?? [];
        const ordered = dog?.trainingPrefs
          ? rankCourses(COURSES, dog.trainingPrefs, completedIds).map((r) => r.course)
          : COURSES;
        // Top 3 not-yet-completed get the "recommended" badge
        const recommendedIds = new Set<string>(
          dog?.trainingPrefs
            ? ordered.filter((c) => !completedIds.includes(c.id)).slice(0, 3).map((c) => c.id)
            : []
        );

        return (
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {/* Personalized plan banner */}
        {effectiveDogId && !dog?.trainingPrefs ? (
          <TouchableOpacity
            style={styles.planBanner}
            onPress={() => router.push(`/(shared)/training-prefs/${effectiveDogId}`)}
            activeOpacity={0.85}
          >
            <View style={styles.planBannerIcon}>
              <Ionicons name="sparkles" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.planBannerTitle}>{t('plan.bannerTitle')}</Text>
              <Text style={styles.planBannerDesc}>{t('plan.bannerDesc')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </TouchableOpacity>
        ) : dog?.trainingPrefs && effectiveDogId ? (
          <TouchableOpacity
            style={styles.planEditChip}
            onPress={() => router.push(`/(shared)/training-prefs/${effectiveDogId}`)}
            activeOpacity={0.7}
          >
            <Ionicons name="sparkles" size={12} color={colors.primary} />
            <Text style={styles.planEditChipText}>{t('plan.editPlan')}</Text>
          </TouchableOpacity>
        ) : null}

        {ordered.map((course) => {
          const done = progress[course.id]?.completed === true;
          const recommended = recommendedIds.has(course.id);
          return (
            <TouchableOpacity
              key={course.id}
              style={[styles.courseCard, done && styles.courseCardDone]}
              onPress={() => setSelectedCourse(course)}
              activeOpacity={0.85}
            >
              <View style={styles.courseCardTop}>
                <View>
                  <Text style={styles.courseEmoji}>{course.emoji}</Text>
                  {done && (
                    <View style={styles.doneOverlay}>
                      <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                    </View>
                  )}
                </View>
                <View style={styles.courseCardInfo}>
                  <View style={styles.courseCardRow}>
                    {recommended && !done && (
                      <View style={styles.recommendBadge}>
                        <Ionicons name="sparkles" size={10} color="#fff" />
                        <Text style={styles.recommendBadgeText}>{t('plan.recommended')}</Text>
                      </View>
                    )}
                    <View style={[styles.levelBadge, { backgroundColor: DIFFICULTY_COLORS[course.difficulty] + '18' }]}>
                      <Text style={[styles.levelBadgeText, { color: DIFFICULTY_COLORS[course.difficulty] }]}>
                        {course.level}
                      </Text>
                    </View>
                    <Text style={styles.courseDuration}>⏱ {course.duration}</Text>
                    {/* XP reward */}
                    {!done && (
                      <View style={styles.xpReward}>
                        <Text style={styles.xpRewardText}>+{XP_BY_DIFFICULTY[course.difficulty] ?? 20} XP</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.courseTitle}>{course.title}</Text>
                  <Text style={styles.courseSubtitle}>{course.subtitle}</Text>
                </View>
              </View>
              <View style={styles.courseCardBottom}>
                <Text style={styles.courseLocation}>📍 {course.location}</Text>
                <View style={styles.startBtn}>
                  <Text style={styles.startBtnText}>
                    {done ? t('owner.coursesPage.review') : t('owner.coursesPage.viewCourse')}
                  </Text>
                  <Ionicons name={done ? 'checkmark' : 'arrow-forward'} size={14} color={done ? colors.success : colors.primary} />
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
        );
      })()}

      {/* Detail Modal */}
      <Modal
        visible={selectedCourse !== null}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setSelectedCourse(null)}
      >
        {selectedCourse && (
          <CourseDetail
            course={selectedCourse}
            dogName={decodedName}
            isCompleted={progress[selectedCourse.id]?.completed === true}
            onClose={() => setSelectedCourse(null)}
            onComplete={() => handleComplete(selectedCourse.id, selectedCourse.difficulty)}
            onOpenClicker={() => {
              setSelectedCourse(null);
              router.push('/(shared)/clicker');
            }}
            onOpenRelated={(id) => {
              const next = COURSES.find((c) => c.id === id);
              if (next) setSelectedCourse(next);
            }}
          />
        )}
      </Modal>
    </SafeAreaView>
  );
}

// ─── Course Detail ────────────────────────────────────────────────────────────

function CourseDetail({ course, dogName, isCompleted, onClose, onComplete, onOpenClicker, onOpenRelated }: {
  course: Course;
  dogName: string;
  isCompleted: boolean;
  onClose: () => void;
  onComplete: () => void;
  onOpenClicker: () => void;
  onOpenRelated: (id: string) => void;
}) {
  const { t } = useTranslation();
  const sections = t('owner.coursesPage.sections', { returnObjects: true }) as Record<string, string>;
  const labels = t('owner.coursesPage.labels', { returnObjects: true }) as Record<string, string>;

  // Method selector — defaults to first method when available, otherwise legacy steps.
  const hasMethods = !!course.methods && course.methods.length > 0;
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(
    hasMethods ? course.methods![0].id : null
  );
  const activeMethod = hasMethods
    ? (course.methods!.find((m) => m.id === selectedMethodId) ?? course.methods![0])
    : null;
  const stepsToRender = activeMethod ? activeMethod.steps : course.steps;

  const accentColor = DIFFICULTY_COLORS[course.difficulty] ?? colors.primary;

  return (
    <RNSafeAreaView style={styles.detailContainer}>
      <View style={styles.detailHeader}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.detailHeaderTitle} numberOfLines={1}>
          {dogName ? `${dogName} · ${t('owner.coursesPage.courseLabel')}` : t('owner.coursesPage.courseLabel')}
        </Text>
        <TouchableOpacity
          onPress={onOpenClicker}
          style={styles.clickerHeaderBtn}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('clicker.title')}
        >
          <Ionicons name="radio-button-on" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.detailContent}>
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <View style={[styles.hero, { backgroundColor: accentColor + '0F' }]}>
          <Text style={styles.heroEmoji}>{course.emoji}</Text>
          <View style={[styles.levelBadge, { backgroundColor: accentColor + '20', alignSelf: 'center', marginBottom: spacing.sm }]}>
            <Text style={[styles.levelBadgeText, { color: accentColor }]}>{course.level}</Text>
          </View>
          <Text style={styles.heroTitle}>{course.title}</Text>
          <Text style={styles.heroSubtitle}>{course.subtitle}</Text>

          {/* Quick info badges */}
          <View style={styles.heroBadges}>
            <View style={styles.heroBadge}>
              <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.heroBadgeText}>{course.duration}</Text>
            </View>
            <View style={styles.heroBadge}>
              <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.heroBadgeText}>{course.location}</Text>
            </View>
            <View style={[styles.heroBadge, { backgroundColor: colors.primary + '15', paddingHorizontal: spacing.sm, borderRadius: borderRadius.full }]}>
              <Text style={{ fontSize: fontSize.xs, fontWeight: '800', color: colors.primary }}>
                ⚡ +{XP_BY_DIFFICULTY[course.difficulty] ?? 20} XP
              </Text>
            </View>
          </View>

          {/* Meta info row (age, sessions) */}
          {(course.ageRecommendation || course.estimatedSessions) && (
            <View style={styles.heroMetaRow}>
              {course.ageRecommendation && (
                <View style={styles.heroMetaItem}>
                  <Ionicons name="paw-outline" size={13} color={colors.textSecondary} />
                  <Text style={styles.heroMetaText}>
                    <Text style={styles.heroMetaLabel}>{labels.ageRecommendation}: </Text>
                    {course.ageRecommendation}
                  </Text>
                </View>
              )}
              {course.estimatedSessions && (
                <View style={styles.heroMetaItem}>
                  <Ionicons name="repeat-outline" size={13} color={colors.textSecondary} />
                  <Text style={styles.heroMetaText}>
                    <Text style={styles.heroMetaLabel}>{labels.estimatedSessions}: </Text>
                    {course.estimatedSessions}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Positive-only seal */}
          {course.meta?.positiveOnly && (
            <View style={styles.positiveSeal}>
              <Ionicons name="heart" size={14} color="#10B981" />
              <Text style={styles.positiveSealText}>{labels.positiveOnly}</Text>
            </View>
          )}

          {/* Prerequisites */}
          {course.meta && course.meta.prerequisites.length > 0 && (
            <View style={styles.prereqRow}>
              <Ionicons name="git-branch-outline" size={13} color={colors.textSecondary} />
              <Text style={styles.prereqLabel}>{labels.prerequisites}: </Text>
              {course.meta.prerequisites.map((pid, i) => (
                <TouchableOpacity key={pid} onPress={() => onOpenRelated(pid)}>
                  <Text style={styles.prereqLink}>
                    {t(`owner.coursesPage.${pid}.title`)}
                    {i < course.meta!.prerequisites.length - 1 ? ', ' : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Clicker shortcut */}
          <TouchableOpacity
            style={styles.clickerCta}
            onPress={onOpenClicker}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('clicker.useClicker')}
          >
            <Ionicons name="radio-button-on" size={18} color="#fff" />
            <Text style={styles.clickerCtaText}>{t('clicker.useClicker')}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Objective ─────────────────────────────────────────────────── */}
        <Section title={sections.objective} color="#6366F1">
          <Text style={styles.bodyText}>{course.objective}</Text>
        </Section>

        {/* ── Why is it important ───────────────────────────────────────── */}
        <Section title={sections.why} color="#F59E0B">
          {course.why.map((item, i) => <BulletItem key={i} text={item} />)}
        </Section>

        {/* ── Benefits (NEW) ────────────────────────────────────────────── */}
        {course.benefits && course.benefits.length > 0 && (
          <Section title={sections.benefits} color="#06B6D4">
            {course.benefits.map((item, i) => (
              <View key={i} style={styles.benefitRow}>
                <Text style={styles.benefitIcon}>💎</Text>
                <Text style={styles.benefitText}>{item}</Text>
              </View>
            ))}
          </Section>
        )}

        {/* ── Where ─────────────────────────────────────────────────────── */}
        <Section title={sections.where} color="#10B981">
          {course.where.map((item, i) => <Text key={i} style={styles.bodyText}>{item}</Text>)}
        </Section>

        {/* ── Materials ─────────────────────────────────────────────────── */}
        <Section title={sections.materials} color="#EC4899">
          {course.materials.map((item, i) => <Text key={i} style={styles.bodyText}>{item}</Text>)}
        </Section>

        {/* ── Before you start (NEW) ────────────────────────────────────── */}
        {course.beforeYouStart && course.beforeYouStart.length > 0 && (
          <Section title={sections.beforeYouStart} color="#A855F7">
            {course.beforeYouStart.map((item, i) => (
              <View key={i} style={styles.checkRow}>
                <Ionicons name="checkbox-outline" size={18} color="#A855F7" />
                <Text style={styles.checkText}>{item}</Text>
              </View>
            ))}
          </Section>
        )}

        {/* ── Method selector + steps ───────────────────────────────────── */}
        {hasMethods && course.methods!.length > 1 && (
          <View style={styles.sectionBox}>
            <Text style={styles.sectionTitle}>{sections.methods}</Text>
            <View style={styles.methodTabs}>
              {course.methods!.map((m) => {
                const active = m.id === selectedMethodId;
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.methodTab, active && { backgroundColor: accentColor, borderColor: accentColor }]}
                    onPress={() => setSelectedMethodId(m.id)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.methodTabText, active && { color: '#fff' }]} numberOfLines={2}>
                      {m.title}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {activeMethod && (
              <View style={styles.methodCard}>
                <Text style={styles.methodCardDesc}>{activeMethod.description}</Text>
                <View style={styles.methodBestForRow}>
                  <Ionicons name="ribbon-outline" size={14} color={colors.primary} />
                  <Text style={styles.methodBestForLabel}>{labels.bestFor}: </Text>
                  <Text style={styles.methodBestForText}>{activeMethod.bestFor}</Text>
                </View>
              </View>
            )}
          </View>
        )}

        <View style={styles.sectionBox}>
          {!hasMethods && <Text style={styles.sectionTitle}>{sections.steps}</Text>}
          {hasMethods && course.methods!.length === 1 && <Text style={styles.sectionTitle}>{sections.steps}</Text>}
          {stepsToRender.map((step) => <StepCard key={step.number} step={step} tipLabel={labels.tip} />)}
        </View>

        {/* ── Common errors (now structured & collapsible) ──────────────── */}
        {course.commonErrors.length > 0 && (
          <CollapsibleSection title={sections.errors} color="#EF4444" badgeCount={course.commonErrors.length}>
            {course.commonErrors.map((item, i) => {
              if (typeof item === 'string') {
                return (
                  <View key={i} style={styles.errorRow}>
                    <Text style={styles.errorIcon}>❌</Text>
                    <Text style={styles.errorText}>{item}</Text>
                  </View>
                );
              }
              return (
                <View key={i} style={styles.errorCard}>
                  <View style={styles.errorRow}>
                    <Text style={styles.errorIcon}>❌</Text>
                    <Text style={[styles.errorText, { fontWeight: '700' }]}>{item.error}</Text>
                  </View>
                  <View style={styles.errorMetaRow}>
                    <Text style={styles.errorMetaLabel}>{labels.cause}: </Text>
                    <Text style={styles.errorMetaText}>{item.cause}</Text>
                  </View>
                  <View style={[styles.errorMetaRow, styles.errorFixRow]}>
                    <Ionicons name="bulb-outline" size={14} color="#10B981" />
                    <Text style={styles.errorFixLabel}>{labels.fix}: </Text>
                    <Text style={styles.errorFixText}>{item.fix}</Text>
                  </View>
                </View>
              );
            })}
          </CollapsibleSection>
        )}

        {/* ── Troubleshooting (NEW, collapsible) ────────────────────────── */}
        {course.troubleshooting && course.troubleshooting.length > 0 && (
          <CollapsibleSection title={sections.troubleshooting} color="#F97316" badgeCount={course.troubleshooting.length}>
            {course.troubleshooting.map((item, i) => (
              <View key={i} style={styles.troubleCard}>
                <View style={styles.troubleHeader}>
                  <Ionicons name="help-circle" size={16} color="#F97316" />
                  <Text style={styles.troubleProblem}>{item.problem}</Text>
                </View>
                <Text style={styles.troubleSolution}>{item.solution}</Text>
              </View>
            ))}
          </CollapsibleSection>
        )}

        {/* ── Progress milestones (NEW) ─────────────────────────────────── */}
        {course.progressMilestones && course.progressMilestones.length > 0 && (
          <Section title={sections.milestones} color="#06B6D4">
            <View style={styles.timeline}>
              {course.progressMilestones.map((ms, i) => (
                <View key={i} style={styles.timelineItem}>
                  <View style={styles.timelineLeft}>
                    <View style={[styles.timelineDot, { backgroundColor: accentColor }]} />
                    {i < course.progressMilestones!.length - 1 && <View style={styles.timelineLine} />}
                  </View>
                  <View style={styles.timelineBody}>
                    <Text style={styles.timelineStage}>{ms.stage}</Text>
                    <Text style={styles.timelineGoal}>{ms.goal}</Text>
                  </View>
                </View>
              ))}
            </View>
          </Section>
        )}

        {/* ── Success signs ─────────────────────────────────────────────── */}
        <Section title={sections.success} color="#10B981">
          {course.successSigns.map((item, i) => (
            <View key={i} style={styles.successRow}>
              <Text style={styles.successIcon}>✅</Text>
              <Text style={styles.successText}>{item}</Text>
            </View>
          ))}
        </Section>

        {/* ── Variations (NEW, collapsible) ─────────────────────────────── */}
        {course.variations && course.variations.length > 0 && (
          <CollapsibleSection title={sections.variations} color="#8B5CF6" badgeCount={course.variations.length}>
            {course.variations.map((item, i) => (
              <View key={i} style={styles.variationRow}>
                <Text style={styles.variationIcon}>🎯</Text>
                <Text style={styles.variationText}>{item}</Text>
              </View>
            ))}
          </CollapsibleSection>
        )}

        {/* ── Safety notes (NEW, collapsible) ───────────────────────────── */}
        {course.safetyNotes && course.safetyNotes.length > 0 && (
          <CollapsibleSection title={sections.safety} color="#0EA5E9" badgeCount={course.safetyNotes.length}>
            {course.safetyNotes.map((item, i) => (
              <View key={i} style={styles.safetyRow}>
                <View style={styles.safetyDot} />
                <Text style={styles.safetyText}>{item}</Text>
              </View>
            ))}
          </CollapsibleSection>
        )}

        {/* ── Fun fact (NEW) ────────────────────────────────────────────── */}
        {course.funFact && (
          <View style={styles.funFactBox}>
            <Text style={styles.funFactLabel}>{sections.funFact}</Text>
            <Text style={styles.funFactText}>{course.funFact}</Text>
          </View>
        )}

        {/* ── Next level ────────────────────────────────────────────────── */}
        <View style={styles.nextLevelBox}>
          <Text style={styles.nextLevelLabel}>{t('owner.coursesPage.nextLevelLabel')}</Text>
          <Text style={styles.nextLevelText}>{course.nextLevel}</Text>
        </View>

        {/* ── Pro tip ───────────────────────────────────────────────────── */}
        <View style={styles.proTipBox}>
          <View style={styles.proTipHeader}>
            <Ionicons name="school" size={18} color={colors.primary} />
            <Text style={styles.proTipLabel}>{t('owner.coursesPage.proTipLabel')}</Text>
          </View>
          <Text style={styles.proTipText}>{course.proTip}</Text>
        </View>

        {/* ── Related courses (NEW) ─────────────────────────────────────── */}
        {course.meta && course.meta.relatedCourses.length > 0 && (
          <View style={styles.sectionBox}>
            <Text style={styles.sectionTitle}>{sections.related}</Text>
            <View style={styles.relatedRow}>
              {course.meta.relatedCourses.map((rid) => {
                const rmeta = COURSE_META[rid];
                if (!rmeta) return null;
                return (
                  <TouchableOpacity
                    key={rid}
                    style={styles.relatedChip}
                    onPress={() => onOpenRelated(rid)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.relatedEmoji}>{rmeta.emoji}</Text>
                    <Text style={styles.relatedTitle} numberOfLines={1}>
                      {t(`owner.coursesPage.${rid}.title`)}
                    </Text>
                    <Ionicons name="arrow-forward" size={14} color={colors.primary} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Practice timer */}
        <View style={styles.timerWrap}>
          <LessonTimer durationMinutes={parseDurationMinutes(course.duration)} />
        </View>

        <TouchableOpacity
          style={[styles.completeBtn, isCompleted && styles.completeBtnDone]}
          onPress={() => { if (!isCompleted) { onComplete(); onClose(); } }}
          activeOpacity={isCompleted ? 1 : 0.8}
        >
          <Ionicons
            name={isCompleted ? 'checkmark-circle' : 'checkmark-circle-outline'}
            size={20}
            color={isCompleted ? colors.success : '#fff'}
          />
          <Text style={[styles.completeBtnText, isCompleted && styles.completeBtnTextDone]}>
            {isCompleted ? t('owner.coursesPage.completed') : t('owner.coursesPage.markComplete')}
          </Text>
          {!isCompleted && (
            <Text style={styles.completeBtnXp}>
              +{XP_BY_DIFFICULTY[course.difficulty] ?? 20} XP
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </RNSafeAreaView>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Section({ title, children, color }: { title: string; children: React.ReactNode; color: string }) {
  return (
    <View style={styles.sectionBox}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={[styles.sectionContent, { borderLeftColor: color }]}>{children}</View>
    </View>
  );
}
function CollapsibleSection({
  title,
  color,
  defaultExpanded = false,
  badgeCount,
  children,
}: {
  title: string;
  color: string;
  defaultExpanded?: boolean;
  badgeCount?: number;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState<boolean>(defaultExpanded);
  return (
    <View style={styles.sectionBox}>
      <TouchableOpacity
        onPress={() => setExpanded((e) => !e)}
        activeOpacity={0.7}
        style={styles.collapsibleHeader}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <Text style={[styles.sectionTitle, { marginBottom: 0, flex: 1 }]}>{title}</Text>
        {typeof badgeCount === 'number' && (
          <View style={[styles.collapsibleCount, { backgroundColor: color + '20' }]}>
            <Text style={[styles.collapsibleCountText, { color }]}>{badgeCount}</Text>
          </View>
        )}
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.textSecondary}
        />
      </TouchableOpacity>
      {expanded && (
        <View style={[styles.sectionContent, { borderLeftColor: color, marginTop: spacing.md }]}>
          {children}
        </View>
      )}
    </View>
  );
}
function BulletItem({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <View style={styles.bullet} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}
function StepCard({ step, tipLabel }: { step: Step; tipLabel?: string }) {
  return (
    <View style={styles.stepCard}>
      <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{step.number}</Text></View>
      <View style={styles.stepBody}>
        <Text style={styles.stepTitle}>{step.title}</Text>
        <Text style={styles.stepDesc}>{step.description}</Text>
        {step.tip && (
          <View style={styles.stepTip}>
            <Ionicons name="information-circle-outline" size={14} color={colors.primary} />
            <Text style={styles.stepTipText}>{tipLabel ? `${tipLabel}: ${step.tip}` : step.tip}</Text>
          </View>
        )}
        {step.troubleshooting && (
          <View style={styles.stepTrouble}>
            <Ionicons name="alert-circle-outline" size={14} color="#F97316" />
            <Text style={styles.stepTroubleText}>{step.troubleshooting}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.sm,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text, textAlign: 'center' },

  // Dog picker (only shown when accessing from the tab with multiple dogs).
  // The chips need an explicit minHeight + minWidth because the original
  // build was rendering as ~empty pills on Android — looked like the row
  // got compressed by the parent's flex layout and the text was clipped
  // out. Setting explicit dimensions guarantees the labels render.
  dogPickerRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'center',
  },
  dogPickerChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 36,
    minWidth: 64,
    borderRadius: borderRadius.full,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dogPickerChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dogPickerChipText: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: '700',
    textAlign: 'center',
  },
  dogPickerChipTextSelected: {
    color: colors.textOnPrimary,
    fontWeight: '800',
  },

  // ── Stats panel ──
  statsPanel: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  levelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    minWidth: 100,
  },
  levelEmoji: { fontSize: 28 },
  levelNum: { fontSize: fontSize.xs, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  levelName: { fontSize: fontSize.md, fontWeight: '700' },

  statsRight: { flex: 1, gap: spacing.xs },

  xpRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  xpLabel: { fontSize: fontSize.xs, fontWeight: '700', color: colors.text },
  xpHint: { fontSize: 10, color: colors.textSecondary },

  xpTrack: {
    height: 7, backgroundColor: colors.border,
    borderRadius: 4, overflow: 'hidden',
  },
  xpFill: { height: '100%', borderRadius: 4 },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 2 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.backgroundSecondary,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
    borderRadius: borderRadius.full,
    borderWidth: 1, borderColor: colors.border,
  },
  pillRecord: { borderColor: '#F59E0B40', backgroundColor: '#F59E0B10' },
  pillIcon: { fontSize: 12 },
  pillText: { fontSize: 11, color: colors.text, fontWeight: '600' },

  // Level-up toast
  levelUpToast: {
    position: 'absolute', top: 130, alignSelf: 'center', zIndex: 99,
    backgroundColor: '#18181B', borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    ...shadow.lg,
  },
  levelUpText: { color: '#fff', fontWeight: '800', fontSize: fontSize.sm },

  list: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

  // Course card
  courseCard: {
    backgroundColor: colors.background, borderRadius: borderRadius.lg,
    padding: spacing.md, ...shadow.sm, borderWidth: 1, borderColor: colors.border,
  },
  courseCardDone: { borderColor: colors.success + '50', backgroundColor: colors.success + '05' },
  courseCardTop: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  courseEmoji: { fontSize: 44 },
  doneOverlay: { position: 'absolute', bottom: -4, right: -4, backgroundColor: colors.background, borderRadius: 12 },
  courseCardInfo: { flex: 1, gap: 4 },
  courseCardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  levelBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.full },
  levelBadgeText: { fontSize: fontSize.xs, fontWeight: '700' },
  courseDuration: { fontSize: fontSize.xs, color: colors.textSecondary },
  xpReward: {
    backgroundColor: colors.primary + '15', paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  xpRewardText: { fontSize: 10, fontWeight: '800', color: colors.primary },
  courseTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text },
  courseSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 18 },
  courseCardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  courseLocation: { fontSize: fontSize.xs, color: colors.textSecondary, flex: 1 },
  startBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  startBtnText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '700' },

  // Detail
  detailContainer: { flex: 1, backgroundColor: colors.background },
  detailHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  closeBtn: { width: 40, height: 40, justifyContent: 'center' },
  detailHeaderTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, flex: 1, textAlign: 'center' },
  detailContent: { paddingBottom: spacing.xxl },
  hero: {
    alignItems: 'center', padding: spacing.xl,
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  heroEmoji: { fontSize: 72, marginBottom: spacing.sm },
  heroTitle: { fontSize: fontSize.xxl, fontWeight: '900', color: colors.text, textAlign: 'center' },
  heroSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', marginTop: 4, lineHeight: 20 },
  heroBadges: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap', justifyContent: 'center' },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroBadgeText: { fontSize: fontSize.xs, color: colors.textSecondary },
  sectionBox: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.text, marginBottom: spacing.md },
  sectionContent: { borderLeftWidth: 3, paddingLeft: spacing.md, gap: spacing.sm },
  bodyText: { fontSize: fontSize.sm, color: colors.text, lineHeight: 22 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginTop: 8 },
  bulletText: { flex: 1, fontSize: fontSize.sm, color: colors.text, lineHeight: 22 },
  stepCard: {
    flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md,
    backgroundColor: colors.backgroundSecondary, borderRadius: borderRadius.md, padding: spacing.md,
  },
  stepNumber: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stepNumberText: { color: '#fff', fontWeight: '800', fontSize: fontSize.sm },
  stepBody: { flex: 1, gap: 4 },
  stepTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  stepDesc: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  stepTip: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 4,
    backgroundColor: colors.primary + '10', borderRadius: borderRadius.sm, padding: spacing.sm,
  },
  stepTipText: { flex: 1, fontSize: fontSize.xs, color: colors.primary, fontWeight: '600' },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  errorIcon: { fontSize: 14, marginTop: 2 },
  errorText: { flex: 1, fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },
  successRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  successIcon: { fontSize: 14, marginTop: 2 },
  successText: { flex: 1, fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },
  nextLevelBox: {
    margin: spacing.lg, backgroundColor: colors.secondary + '12',
    borderRadius: borderRadius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.secondary + '30',
  },
  nextLevelLabel: { fontSize: fontSize.md, fontWeight: '800', color: colors.secondary, marginBottom: spacing.sm },
  nextLevelText: { fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },
  proTipBox: {
    margin: spacing.lg, marginTop: 0, backgroundColor: colors.primary + '10',
    borderRadius: borderRadius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.primary + '25',
  },
  proTipHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  proTipLabel: { fontSize: fontSize.md, fontWeight: '800', color: colors.primary },
  proTipText: { fontSize: fontSize.sm, color: colors.text, lineHeight: 22 },
  completeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    margin: spacing.lg, marginTop: spacing.sm,
    backgroundColor: colors.primary, borderRadius: borderRadius.lg, paddingVertical: spacing.md,
  },
  completeBtnDone: { backgroundColor: colors.success + '15', borderWidth: 1, borderColor: colors.success + '40' },
  completeBtnText: { fontSize: fontSize.md, fontWeight: '700', color: '#fff' },
  completeBtnTextDone: { color: colors.success },
  completeBtnXp: {
    fontSize: fontSize.xs, fontWeight: '800', color: '#fff',
    backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  timerWrap: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  // Clicker access (header + course detail hero)
  clickerHeaderBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clickerCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    marginTop: spacing.md,
    alignSelf: 'center',
    ...shadow.sm,
  },
  clickerCtaText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: fontSize.sm,
  },
  // Personalized plan banner & badges
  planBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primary + '12',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.primary + '40',
    marginBottom: spacing.sm,
  },
  planBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planBannerTitle: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.text,
  },
  planBannerDesc: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  planEditChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-end',
    backgroundColor: colors.primary + '15',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    marginBottom: spacing.xs,
  },
  planEditChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  recommendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.primary,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  recommendBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },

  // ─── Collapsible section ────────────────────────────────────────────────
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  collapsibleCount: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    minWidth: 22,
    alignItems: 'center',
  },
  collapsibleCountText: { fontSize: fontSize.xs, fontWeight: '800' },

  // ─── Hero meta + seals ──────────────────────────────────────────────────
  heroMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  heroMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  heroMetaText: { fontSize: fontSize.xs, color: colors.textSecondary },
  heroMetaLabel: { fontWeight: '700', color: colors.text },
  positiveSeal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#10B98115',
    borderColor: '#10B98140',
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    marginTop: spacing.md,
  },
  positiveSealText: { fontSize: fontSize.xs, fontWeight: '800', color: '#10B981', letterSpacing: 0.4, textTransform: 'uppercase' },
  prereqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 3,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  prereqLabel: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '700' },
  prereqLink: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '700', textDecorationLine: 'underline' },

  // ─── Benefits ───────────────────────────────────────────────────────────
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  benefitIcon: { fontSize: 14, marginTop: 2 },
  benefitText: { flex: 1, fontSize: fontSize.sm, color: colors.text, lineHeight: 22 },

  // ─── Before you start checklist ─────────────────────────────────────────
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 2 },
  checkText: { flex: 1, fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },

  // ─── Method selector ────────────────────────────────────────────────────
  methodTabs: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, flexWrap: 'wrap' },
  methodTab: {
    flex: 1,
    minWidth: 140,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    backgroundColor: colors.background,
  },
  methodTabText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.text, textAlign: 'center' },
  methodCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  methodCardDesc: { fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },
  methodBestForRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  methodBestForLabel: { fontSize: fontSize.xs, fontWeight: '800', color: colors.primary },
  methodBestForText: { fontSize: fontSize.xs, color: colors.text, flex: 1, fontStyle: 'italic' },

  // ─── Step troubleshooting inline ────────────────────────────────────────
  stepTrouble: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 4,
    backgroundColor: '#F9731610', borderRadius: borderRadius.sm, padding: spacing.sm,
  },
  stepTroubleText: { flex: 1, fontSize: fontSize.xs, color: '#9A3412', fontWeight: '600' },

  // ─── Structured errors ─────────────────────────────────────────────────
  errorCard: {
    gap: spacing.xs,
    padding: spacing.md,
    backgroundColor: '#EF444408',
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: '#EF444420',
  },
  errorMetaRow: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', marginLeft: 22 },
  errorMetaLabel: { fontSize: fontSize.xs, fontWeight: '800', color: colors.textSecondary },
  errorMetaText: { flex: 1, fontSize: fontSize.xs, color: colors.text, lineHeight: 18 },
  errorFixRow: {
    backgroundColor: '#10B98112',
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginLeft: 22,
    marginTop: 4,
    gap: 4,
    alignItems: 'center',
  },
  errorFixLabel: { fontSize: fontSize.xs, fontWeight: '800', color: '#10B981' },
  errorFixText: { flex: 1, fontSize: fontSize.xs, color: colors.text, lineHeight: 18, fontWeight: '600' },

  // ─── Troubleshooting cards ─────────────────────────────────────────────
  troubleCard: {
    backgroundColor: '#F9731608',
    borderColor: '#F9731625',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  troubleHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  troubleProblem: { flex: 1, fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  troubleSolution: { fontSize: fontSize.sm, color: colors.text, lineHeight: 20, marginLeft: 24 },

  // ─── Timeline (milestones) ─────────────────────────────────────────────
  timeline: { gap: 0 },
  timelineItem: { flexDirection: 'row', gap: spacing.md, paddingBottom: spacing.md },
  timelineLeft: { width: 16, alignItems: 'center' },
  timelineDot: {
    width: 12, height: 12, borderRadius: 6,
    marginTop: 4,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: colors.border,
    marginTop: 4,
  },
  timelineBody: { flex: 1, paddingBottom: spacing.sm },
  timelineStage: { fontSize: fontSize.xs, fontWeight: '800', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  timelineGoal: { fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },

  // ─── Variations ─────────────────────────────────────────────────────────
  variationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 2 },
  variationIcon: { fontSize: 14, marginTop: 2 },
  variationText: { flex: 1, fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },

  // ─── Safety box ─────────────────────────────────────────────────────────
  safetyBox: {
    margin: spacing.lg,
    marginTop: 0,
    marginBottom: spacing.sm,
    backgroundColor: '#0EA5E912',
    borderColor: '#0EA5E940',
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  safetyHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  safetyTitle: { fontSize: fontSize.md, fontWeight: '800', color: '#0369A1', flex: 1 },
  safetyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginLeft: 26 },
  safetyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#0EA5E9', marginTop: 8 },
  safetyText: { flex: 1, fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },

  // ─── Fun fact ───────────────────────────────────────────────────────────
  funFactBox: {
    margin: spacing.lg,
    marginTop: 0,
    marginBottom: spacing.sm,
    backgroundColor: '#FEF3C7',
    borderColor: '#FCD34D',
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  funFactLabel: { fontSize: fontSize.xs, fontWeight: '800', color: '#92400E', textTransform: 'uppercase', letterSpacing: 0.5 },
  funFactText: { fontSize: fontSize.sm, color: '#78350F', lineHeight: 20, fontStyle: 'italic' },

  // ─── Related courses ───────────────────────────────────────────────────
  relatedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  relatedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary + '12',
    borderColor: colors.primary + '40',
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  relatedEmoji: { fontSize: 18 },
  relatedTitle: { fontSize: fontSize.xs, fontWeight: '700', color: colors.primary, maxWidth: 110 },
});
