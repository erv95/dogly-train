import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  CHALLENGE_TEMPLATES,
  CHALLENGE_COLORS,
  CHALLENGE_ICONS,
} from '../../../src/data/challengeTemplates';
import {
  getChallengeProgress,
  startChallenge,
  markDayComplete,
  unmarkDayComplete,
  currentDayOf,
  isDayDone,
} from '../../../src/services/challenges';
import { ChallengeId, ChallengeProgress } from '../../../src/types';
import { useAuth } from '../../../src/contexts/AuthContext';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../../src/theme';

export default function ChallengeDetailScreen() {
  const { challengeId, dogId } = useLocalSearchParams<{ challengeId: string; dogId: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { firebaseUser } = useAuth();

  const tplId = challengeId as ChallengeId;
  const template = CHALLENGE_TEMPLATES[tplId];
  const color = CHALLENGE_COLORS[tplId];

  const [progress, setProgress] = useState<ChallengeProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [openDay, setOpenDay] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!firebaseUser || !dogId || !tplId) { setLoading(false); return; }
      let cancelled = false;
      (async () => {
        try {
          const p = await getChallengeProgress(dogId, tplId);
          if (!cancelled) setProgress(p);
        } catch (e) {
          console.error('Error loading progress', e);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => { cancelled = true; };
    }, [firebaseUser?.uid, dogId, tplId])
  );

  const handleStart = async () => {
    if (!firebaseUser || !dogId) return;
    setWorking(true);
    try {
      const p = await startChallenge({ userId: firebaseUser.uid, dogId, templateId: tplId });
      setProgress(p);
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message ?? '');
    } finally {
      setWorking(false);
    }
  };

  const handleToggle = async (day: number) => {
    if (!progress) return;
    setWorking(true);
    try {
      if (isDayDone(progress, day)) {
        const updated = await unmarkDayComplete(progress, day);
        setProgress(updated);
      } else {
        const { progress: updated, xpEarned } = await markDayComplete(progress, day);
        setProgress(updated);
        if (updated.completed) {
          Alert.alert(
            t('challenges.completedTitle'),
            t('challenges.completedBody', { name: t(`challenges.${tplId}.name`) }),
          );
        } else if (xpEarned > 0) {
          // Subtle, no Alert for normal day-tick — celebration is in the UI cells
        }
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message ?? '');
    } finally {
      setWorking(false);
    }
  };

  if (!template) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.empty}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.textLight} />
          <Text style={styles.emptyText}>{t('challenges.notFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={styles.loader} color={color} size="large" />
      </SafeAreaView>
    );
  }

  const completedCount = progress?.completions.length ?? 0;
  const pct = (completedCount / 30) * 100;
  const currentDay = currentDayOf(progress);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: t(`challenges.${tplId}.name`) }} />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Header card */}
        <View style={[styles.headerCard, { backgroundColor: color + '12', borderColor: color + '30' }]}>
          <View style={[styles.headerIcon, { backgroundColor: color + '25' }]}>
            <Ionicons name={CHALLENGE_ICONS[tplId] as any} size={28} color={color} />
          </View>
          <Text style={styles.headerTitle}>{t(`challenges.${tplId}.name`)}</Text>
          <Text style={styles.headerDesc}>{t(`challenges.${tplId}.description`)}</Text>

          {progress ? (
            <>
              <View style={styles.progressRow}>
                <Text style={[styles.progressCount, { color }]}>
                  {completedCount}/30
                </Text>
                <Text style={styles.progressLabel}>{t('challenges.daysDone')}</Text>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${pct}%`, backgroundColor: color }]} />
              </View>
              {progress.completed && (
                <View style={[styles.completedBanner, { backgroundColor: color + '15' }]}>
                  <Ionicons name="trophy" size={16} color={color} />
                  <Text style={[styles.completedText, { color }]}>{t('challenges.allDoneCelebration')}</Text>
                </View>
              )}
            </>
          ) : (
            <TouchableOpacity
              style={[styles.startBtn, { backgroundColor: color }]}
              onPress={handleStart}
              disabled={working}
              activeOpacity={0.85}
            >
              {working
                ? <ActivityIndicator color="#fff" />
                : (
                  <>
                    <Ionicons name="play" size={18} color="#fff" />
                    <Text style={styles.startBtnText}>{t('challenges.startCta')}</Text>
                  </>
                )}
            </TouchableOpacity>
          )}
        </View>

        {/* 30-day grid */}
        {progress && (
          <View style={styles.gridWrap}>
            {Array.from({ length: 30 }, (_, i) => i + 1).map((day) => {
              const done = isDayDone(progress, day);
              const isCurrent = !done && day === currentDay;
              const isFuture = !done && day > currentDay;
              return (
                <TouchableOpacity
                  key={day}
                  style={[
                    styles.gridCell,
                    done && { backgroundColor: color, borderColor: color },
                    isCurrent && { borderColor: color, borderWidth: 2 },
                    isFuture && styles.gridCellFuture,
                  ]}
                  onPress={() => setOpenDay(day)}
                  activeOpacity={0.7}
                >
                  {done ? (
                    <Ionicons name="checkmark" size={18} color="#fff" />
                  ) : (
                    <Text style={[
                      styles.gridDayText,
                      isFuture && { color: colors.textLight },
                      isCurrent && { color, fontWeight: '900' },
                    ]}>
                      {day}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {progress && (
          <Text style={styles.footHint}>{t('challenges.tapDayHint')}</Text>
        )}
      </ScrollView>

      {/* Day instruction modal */}
      <Modal visible={openDay !== null} transparent animationType="fade" onRequestClose={() => setOpenDay(null)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setOpenDay(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
            {openDay !== null && progress && (() => {
              const dayMeta = template.days.find((d) => d.day === openDay)!;
              const done = isDayDone(progress, openDay);
              return (
                <>
                  <View style={[styles.modalHeader, { backgroundColor: color + '15' }]}>
                    <Text style={[styles.modalDayLabel, { color }]}>
                      {t('challenges.dayN', { n: openDay })}
                    </Text>
                  </View>
                  <Text style={styles.modalTitle}>
                    {t(`challenges.${tplId}.days.${openDay}.title`)}
                  </Text>
                  <Text style={styles.modalInstruction}>
                    {t(`challenges.${tplId}.days.${openDay}.instruction`)}
                  </Text>
                  <View style={styles.modalMetaRow}>
                    <View style={styles.metaPill}>
                      <Ionicons name="time-outline" size={11} color={colors.textSecondary} />
                      <Text style={styles.metaText}>{dayMeta.estimatedMinutes} min</Text>
                    </View>
                    <View style={styles.metaPill}>
                      <Ionicons name="star-outline" size={11} color={colors.textSecondary} />
                      <Text style={styles.metaText}>+{dayMeta.xpReward} XP</Text>
                    </View>
                  </View>
                  {dayMeta.courseId && (
                    <TouchableOpacity
                      style={styles.courseLink}
                      onPress={() => {
                        setOpenDay(null);
                        router.push(`/(shared)/courses?courseId=${dayMeta.courseId}`);
                      }}
                    >
                      <Ionicons name="open-outline" size={14} color={color} />
                      <Text style={[styles.courseLinkText, { color }]}>
                        {t('challenges.openRelatedCourse')}
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.modalToggleBtn, done ? styles.modalUntickBtn : { backgroundColor: color }]}
                    onPress={async () => {
                      const day = openDay;
                      setOpenDay(null);
                      await handleToggle(day);
                    }}
                    disabled={working}
                  >
                    {working
                      ? <ActivityIndicator color={done ? colors.text : '#fff'} />
                      : (
                        <>
                          <Ionicons name={done ? 'arrow-undo' : 'checkmark'} size={18} color={done ? colors.text : '#fff'} />
                          <Text style={[styles.modalToggleBtnText, done && { color: colors.text }]}>
                            {done ? t('challenges.untickDay') : t('challenges.markDayDone')}
                          </Text>
                        </>
                      )}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setOpenDay(null)} style={styles.modalCancel}>
                    <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  loader: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyText: { color: colors.textSecondary, fontSize: fontSize.md },
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },

  headerCard: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    gap: 6,
  },
  headerIcon: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  headerTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text, textAlign: 'center' },
  headerDesc: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },

  progressRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: spacing.sm },
  progressCount: { fontSize: 28, fontWeight: '800' },
  progressLabel: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600' },
  progressBarBg: {
    height: 6, borderRadius: 3,
    backgroundColor: colors.backgroundSecondary,
    overflow: 'hidden',
    width: '100%',
  },
  progressBarFill: { height: '100%', borderRadius: 3 },

  completedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    borderRadius: borderRadius.full,
    marginTop: spacing.sm,
  },
  completedText: { fontWeight: '800', fontSize: fontSize.sm },

  startBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    marginTop: spacing.md,
  },
  startBtnText: { color: '#fff', fontWeight: '800', fontSize: fontSize.md },

  gridWrap: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: spacing.xs,
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    ...shadow.sm,
  },
  gridCell: {
    width: '14.5%',
    aspectRatio: 1,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1, borderColor: colors.border,
  },
  gridCellFuture: { backgroundColor: colors.backgroundSecondary, opacity: 0.7 },
  gridDayText: { fontWeight: '800', color: colors.text, fontSize: fontSize.sm },

  footHint: {
    fontSize: fontSize.xs, color: colors.textLight,
    textAlign: 'center', marginTop: spacing.sm,
  },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  modalCard: {
    width: '100%', backgroundColor: colors.background,
    borderRadius: borderRadius.lg, padding: spacing.lg,
    gap: spacing.sm, ...shadow.lg,
  },
  modalHeader: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: borderRadius.full },
  modalDayLabel: { fontSize: fontSize.xs, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  modalTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text, marginTop: 4 },
  modalInstruction: { fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },
  modalMetaRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  metaPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 6, paddingVertical: 3,
    borderRadius: borderRadius.full,
    backgroundColor: colors.backgroundSecondary,
  },
  metaText: { fontSize: 10, color: colors.textSecondary, fontWeight: '700' },

  courseLink: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    gap: 4,
    paddingVertical: 4,
  },
  courseLinkText: { fontSize: fontSize.sm, fontWeight: '700' },

  modalToggleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.md, borderRadius: borderRadius.full,
    marginTop: spacing.sm,
  },
  modalUntickBtn: { backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.border },
  modalToggleBtnText: { color: '#fff', fontWeight: '800', fontSize: fontSize.md },

  modalCancel: { alignItems: 'center', paddingVertical: 6 },
  modalCancelText: { color: colors.textSecondary, fontWeight: '700' },
});
