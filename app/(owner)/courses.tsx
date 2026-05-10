import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  SafeAreaView as RNSafeAreaView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../src/contexts/AuthContext';
import { getCourseProgress, markCourseCompleted, CourseProgress } from '../../src/services/courseProgress';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../src/theme';

const DIFFICULTY_COLORS: Record<string, string> = {
  very_basic:   '#22C55E',
  basic:        '#84CC16',
  intermediate: '#F59E0B',
  advanced:     '#EF4444',
  expert:       '#8B5CF6',
};

interface Step {
  number: number;
  title: string;
  description: string;
  tip?: string;
}

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
  steps: Step[];
  commonErrors: string[];
  successSigns: string[];
  nextLevel: string;
  proTip: string;
}

const COURSE_DEFS: Array<{ id: string; emoji: string; difficulty: string }> = [
  { id: 'sit',         emoji: '🐶',           difficulty: 'very_basic' },
  { id: 'lie',         emoji: '🐕',           difficulty: 'very_basic' },
  { id: 'name',        emoji: '🐶',           difficulty: 'very_basic' },
  { id: 'come',        emoji: '🏃',           difficulty: 'basic' },
  { id: 'stay',        emoji: '✋',                 difficulty: 'basic' },
  { id: 'leash',       emoji: '🦮',           difficulty: 'basic' },
  { id: 'paw',         emoji: '🤝',           difficulty: 'intermediate' },
  { id: 'place',       emoji: '🛏️',     difficulty: 'intermediate' },
  { id: 'distraction', emoji: '🎯',           difficulty: 'advanced' },
  { id: 'drop',        emoji: '🦴',           difficulty: 'advanced' },
];

export default function CoursesScreen() {
  const { t } = useTranslation();
  const { firebaseUser } = useAuth();
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [progress, setProgress] = useState<Record<string, CourseProgress>>({});

  // Build all 10 courses from translations — memoized so it only re-runs on language change
  const COURSES = useMemo<Course[]>(() => {
    return COURSE_DEFS.map(({ id, emoji, difficulty }) => {
      const key = `owner.coursesPage.${id}`;
      const steps = (t(`${key}.steps`, { returnObjects: true }) as any[]).map(
        (s: any, i: number) => ({ number: i + 1, title: s.title, description: s.description, tip: s.tip })
      );
      return {
        id,
        emoji,
        difficulty,
        title: t(`${key}.title`),
        subtitle: t(`${key}.subtitle`),
        level: t(`${key}.level`),
        duration: t(`${key}.duration`),
        location: t(`${key}.location`),
        objective: t(`${key}.objective`),
        why: t(`${key}.why`, { returnObjects: true }) as string[],
        where: t(`${key}.where`, { returnObjects: true }) as string[],
        materials: t(`${key}.materials`, { returnObjects: true }) as string[],
        steps,
        commonErrors: t(`${key}.commonErrors`, { returnObjects: true }) as string[],
        successSigns: t(`${key}.successSigns`, { returnObjects: true }) as string[],
        nextLevel: t(`${key}.nextLevel`),
        proTip: t(`${key}.proTip`),
      };
    });
  }, [t]);

  const courseIds = useMemo(() => COURSES.map(c => c.id), [COURSES]);

  const loadProgress = useCallback(async () => {
    if (!firebaseUser) return;
    const p = await getCourseProgress(firebaseUser.uid, '', courseIds);
    setProgress(p);
  }, [firebaseUser, courseIds]);

  useEffect(() => { loadProgress(); }, [loadProgress]);

  const handleComplete = useCallback(async (courseId: string) => {
    if (!firebaseUser) return;
    await markCourseCompleted(firebaseUser.uid, '', courseId);
    setProgress(prev => ({
      ...prev,
      [courseId]: { ...prev[courseId], userId: firebaseUser.uid, dogId: '', courseId, completed: true } as CourseProgress,
    }));
  }, [firebaseUser]);

  const totalCount = COURSES.length;
  const doneCount = COURSES.filter(c => progress[c.id]?.completed === true).length;
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      {/* Vibrant header */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerEmojiCircle}>
            <Text style={styles.headerEmoji}>🎓</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{t('owner.coursesPage.title')}</Text>
            <Text style={styles.headerSubtitle}>{t('owner.coursesPage.subtitle')}</Text>
          </View>
          {/* Quick clicker access */}
          <TouchableOpacity
            style={styles.headerClickerBtn}
            onPress={() => router.push('/(shared)/clicker')}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('clicker.title')}
          >
            <Ionicons name="radio-button-on" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
        {/* Progress pill */}
        <View style={styles.progressPill}>
          <Ionicons name="trophy" size={14} color="#fff" />
          <Text style={styles.progressPillText}>
            {doneCount} / {totalCount}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {COURSES.map((course) => {
          const done = progress[course.id]?.completed === true;
          const accent = DIFFICULTY_COLORS[course.difficulty];
          return (
            <TouchableOpacity
              key={course.id}
              style={[styles.tile, { backgroundColor: accent }]}
              onPress={() => setSelectedCourse(course)}
              activeOpacity={0.9}
            >
              {/* Decorative blobs (pure CSS) */}
              <View style={styles.tileBlobLg} />
              <View style={styles.tileBlobSm} />

              {/* Done star badge */}
              {done && (
                <View style={styles.doneStar}>
                  <Ionicons name="star" size={16} color="#FFD700" />
                </View>
              )}

              {/* Big emoji */}
              <View style={styles.tileEmojiWrap}>
                <Text style={styles.tileEmoji}>{course.emoji}</Text>
              </View>

              {/* Text content */}
              <View style={styles.tileContent}>
                <Text style={styles.tileTitle} numberOfLines={1}>
                  {course.title.toUpperCase()}
                </Text>
                <Text style={styles.tileSubtitle} numberOfLines={2}>
                  {course.subtitle}
                </Text>
                <View style={styles.tileMetaRow}>
                  <View style={styles.tileMetaChip}>
                    <Text style={styles.tileMetaChipText}>{course.level}</Text>
                  </View>
                  <View style={styles.tileMetaItem}>
                    <Ionicons name="time-outline" size={11} color="rgba(255,255,255,0.85)" />
                    <Text style={styles.tileMetaText}>{course.duration}</Text>
                  </View>
                </View>
              </View>

              {/* Action button */}
              <View style={styles.tileAction}>
                <Ionicons
                  name={done ? 'checkmark-circle' : 'play'}
                  size={done ? 24 : 18}
                  color={done ? '#FFD700' : '#fff'}
                />
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Modal
        visible={selectedCourse !== null}
        animationType="slide"
        onRequestClose={() => setSelectedCourse(null)}
      >
        {selectedCourse && (
          <CourseDetail
            course={selectedCourse}
            isCompleted={progress[selectedCourse.id]?.completed === true}
            onClose={() => setSelectedCourse(null)}
            onComplete={() => handleComplete(selectedCourse.id)}
            onOpenClicker={() => {
              setSelectedCourse(null);
              router.push('/(shared)/clicker');
            }}
          />
        )}
      </Modal>
    </SafeAreaView>
  );
}

function CourseDetail({ course, isCompleted, onClose, onComplete, onOpenClicker }: {
  course: Course;
  isCompleted: boolean;
  onClose: () => void;
  onComplete: () => void;
  onOpenClicker: () => void;
}) {
  const { t } = useTranslation();
  const sections = t('owner.coursesPage.sections', { returnObjects: true }) as Record<string, string>;

  return (
    <RNSafeAreaView style={styles.detailContainer}>
      <View style={styles.detailHeader}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.detailHeaderTitle}>{t('owner.coursesPage.courseLabel')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.detailContent}>
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>{course.emoji}</Text>
          <View style={[styles.levelBadge, { backgroundColor: DIFFICULTY_COLORS[course.difficulty] + '20', alignSelf: 'center', marginBottom: spacing.sm }]}>
            <Text style={[styles.levelBadgeText, { color: DIFFICULTY_COLORS[course.difficulty] }]}>{course.level}</Text>
          </View>
          <Text style={styles.heroTitle}>{course.title}</Text>
          <Text style={styles.heroSubtitle}>{course.subtitle}</Text>
          <View style={styles.heroBadges}>
            <View style={styles.heroBadge}>
              <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.heroBadgeText}>{course.duration}</Text>
            </View>
            <View style={styles.heroBadge}>
              <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.heroBadgeText}>{course.location}</Text>
            </View>
          </View>

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

        <Section title={sections.objective} color="#6366F1">
          <Text style={styles.bodyText}>{course.objective}</Text>
        </Section>

        <Section title={sections.why} color="#F59E0B">
          {course.why.map((item, i) => <BulletItem key={i} text={item} />)}
        </Section>

        <Section title={sections.where} color="#10B981">
          {course.where.map((item, i) => <Text key={i} style={styles.bodyText}>{item}</Text>)}
        </Section>

        <Section title={sections.materials} color="#EC4899">
          {course.materials.map((item, i) => <Text key={i} style={styles.bodyText}>{item}</Text>)}
        </Section>

        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>{sections.steps}</Text>
          {course.steps.map((step) => <StepCard key={step.number} step={step} />)}
        </View>

        <Section title={sections.errors} color="#EF4444">
          {course.commonErrors.map((item, i) => (
            <View key={i} style={styles.errorRow}>
              <Text style={styles.errorIcon}>❌</Text>
              <Text style={styles.errorText}>{item}</Text>
            </View>
          ))}
        </Section>

        <Section title={sections.success} color="#10B981">
          {course.successSigns.map((item, i) => (
            <View key={i} style={styles.successRow}>
              <Text style={styles.successIcon}>✅</Text>
              <Text style={styles.successText}>{item}</Text>
            </View>
          ))}
        </Section>

        <View style={styles.nextLevelBox}>
          <Text style={styles.nextLevelLabel}>{t('owner.coursesPage.nextLevelLabel')}</Text>
          <Text style={styles.nextLevelText}>{course.nextLevel}</Text>
        </View>

        <View style={styles.proTipBox}>
          <View style={styles.proTipHeader}>
            <Ionicons name="school" size={18} color={colors.primary} />
            <Text style={styles.proTipLabel}>{t('owner.coursesPage.proTipLabel')}</Text>
          </View>
          <Text style={styles.proTipText}>{course.proTip}</Text>
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
        </TouchableOpacity>
      </ScrollView>
    </RNSafeAreaView>
  );
}

function Section({ title, children, color }: { title: string; children: React.ReactNode; color: string }) {
  return (
    <View style={styles.sectionBox}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={[styles.sectionContent, { borderLeftColor: color }]}>{children}</View>
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

function StepCard({ step }: { step: Step }) {
  return (
    <View style={styles.stepCard}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{step.number}</Text>
      </View>
      <View style={styles.stepBody}>
        <Text style={styles.stepTitle}>{step.title}</Text>
        <Text style={styles.stepDesc}>{step.description}</Text>
        {step.tip && (
          <View style={styles.stepTip}>
            <Ionicons name="information-circle-outline" size={14} color={colors.primary} />
            <Text style={styles.stepTipText}>{step.tip}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF6E5' },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.primary,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    ...shadow.md,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerEmojiCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEmoji: { fontSize: 30 },
  headerTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },
  progressPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    marginTop: spacing.md,
  },
  progressPillText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: fontSize.xs,
  },

  // ── List ────────────────────────────────────────────────────────────────────
  list: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

  // ── Course tile (vibrant card) ──────────────────────────────────────────────
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    padding: spacing.md,
    minHeight: 110,
    overflow: 'hidden',
    position: 'relative',
    ...shadow.md,
  },
  // Decorative circles in the background
  tileBlobLg: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  tileBlobSm: {
    position: 'absolute',
    bottom: -30,
    right: 30,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  tileEmojiWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  tileEmoji: { fontSize: 38 },
  tileContent: { flex: 1, gap: 4 },
  tileTitle: {
    fontSize: fontSize.lg,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.5,
  },
  tileSubtitle: {
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 15,
  },
  tileMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  tileMetaChip: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  tileMetaChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  tileMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  tileMetaText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
  },
  tileAction: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  doneStar: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    ...shadow.sm,
  },

  // Used by CourseDetail modal
  levelBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.full },
  levelBadgeText: { fontSize: fontSize.xs, fontWeight: '700' },

  // Clicker quick access in header
  headerClickerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Clicker CTA inside CourseDetail hero
  clickerCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    marginTop: spacing.md,
    ...shadow.sm,
  },
  clickerCtaText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: fontSize.sm,
  },
  detailContainer: { flex: 1, backgroundColor: colors.background },
  detailHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  closeBtn: { width: 40, height: 40, justifyContent: 'center' },
  detailHeaderTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  detailContent: { paddingBottom: spacing.xxl },
  hero: {
    alignItems: 'center', padding: spacing.xl,
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  heroEmoji: { fontSize: 72, marginBottom: spacing.sm },
  heroTitle: { fontSize: fontSize.xxl, fontWeight: '900', color: colors.text, textAlign: 'center' },
  heroSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', marginTop: 4, lineHeight: 20 },
  heroBadges: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
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
    margin: spacing.lg, marginTop: spacing.sm, backgroundColor: colors.primary,
    borderRadius: borderRadius.lg, paddingVertical: spacing.md,
  },
  completeBtnDone: { backgroundColor: colors.success + '15', borderWidth: 1, borderColor: colors.success + '40' },
  completeBtnText: { fontSize: fontSize.md, fontWeight: '700', color: '#fff' },
  completeBtnTextDone: { color: colors.success },
});
