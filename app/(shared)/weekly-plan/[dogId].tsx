import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  getOrCreatePlanForWeek,
  toggleActivity,
  planProgress,
  startOfIsoWeekUtc,
  weekIsoLabel,
  addWeeks,
} from '../../../src/services/weeklyPlans';
import { getDogStats } from '../../../src/services/dogStats';
import { Dog, WeeklyActivity, WeeklyPlan } from '../../../src/types';
import { db } from '../../../src/config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../../../src/contexts/AuthContext';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../../src/theme';

const KIND_ICONS: Record<WeeklyActivity['kind'], string> = {
  training: 'school-outline',
  walk: 'walk-outline',
  mental: 'bulb-outline',
  guide: 'book-outline',
  rest: 'moon-outline',
};

const KIND_COLORS: Record<WeeklyActivity['kind'], string> = {
  training: '#F5A623',
  walk: '#2D9CDB',
  mental: '#9B51E0',
  guide: '#27AE60',
  rest: '#95A5A6',
};

export default function WeeklyPlanScreen() {
  const { dogId } = useLocalSearchParams<{ dogId: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { firebaseUser } = useAuth();

  const [weekDate, setWeekDate] = useState<Date>(new Date());
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  const load = useCallback(async (date: Date, force = false) => {
    if (!firebaseUser || !dogId) return;
    setLoading(true);
    try {
      const dogSnap = await getDoc(doc(db, 'dogs', dogId));
      if (!dogSnap.exists()) {
        setLoading(false);
        return;
      }
      const dog: Dog = { id: dogSnap.id, ...(dogSnap.data() as Omit<Dog, 'id'>) };
      const stats = await getDogStats(dogId).catch(() => null);
      const completedCourseIds = stats?.completedCourseIds ?? [];

      const p = await getOrCreatePlanForWeek({
        dog,
        userId: firebaseUser.uid,
        prefs: dog.trainingPrefs ?? undefined,
        completedCourseIds,
        weekDate: date,
        forceRegenerate: force,
      });
      setPlan(p);
    } catch (e: any) {
      console.error('Error loading weekly plan', e);
      Alert.alert(t('common.error'), e?.message ?? '');
    } finally {
      setLoading(false);
      setRegenerating(false);
    }
  }, [firebaseUser, dogId, t]);

  useEffect(() => { load(weekDate); }, [load, weekDate]);

  const goWeek = (delta: number) => setWeekDate((d) => addWeeks(d, delta));
  const isCurrentWeek = useMemo(() => {
    return weekIsoLabel(weekDate) === weekIsoLabel(new Date());
  }, [weekDate]);

  const handleToggle = async (dayIndex: number, activityId: string) => {
    if (!plan) return;
    try {
      const updated = await toggleActivity(plan, dayIndex, activityId);
      setPlan(updated);
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message ?? '');
    }
  };

  const handleRegenerate = () => {
    Alert.alert(
      t('weeklyPlan.regenerateTitle'),
      t('weeklyPlan.regenerateConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('weeklyPlan.regenerate'),
          style: 'destructive',
          onPress: () => {
            setRegenerating(true);
            load(weekDate, true);
          },
        },
      ],
    );
  };

  const progress = plan ? planProgress(plan) : { total: 0, completed: 0 };
  const progressPct = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;

  const weekStart = startOfIsoWeekUtc(weekDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const weekLabel = `${weekStart.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;

  const dayLabel = (idx: number) => {
    const d = new Date(weekStart);
    d.setUTCDate(d.getUTCDate() + idx);
    return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric' });
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: t('weeklyPlan.title'),
          headerRight: () => (
            <TouchableOpacity onPress={handleRegenerate} style={{ paddingHorizontal: spacing.sm }}>
              <Ionicons name="refresh" size={22} color={colors.primary} />
            </TouchableOpacity>
          ),
        }}
      />

      {/* Week navigator */}
      <View style={styles.weekNav}>
        <TouchableOpacity onPress={() => goWeek(-1)} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
        </TouchableOpacity>
        <View style={styles.weekLabelBox}>
          <Text style={styles.weekLabel}>{weekLabel}</Text>
          {!isCurrentWeek && (
            <TouchableOpacity onPress={() => setWeekDate(new Date())}>
              <Text style={styles.todayLink}>{t('weeklyPlan.today')}</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={() => goWeek(1)} style={styles.navBtn}>
          <Ionicons name="chevron-forward" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Progress */}
      {plan && (
        <View style={styles.progressBox}>
          <View style={styles.progressTopRow}>
            <Text style={styles.progressLabel}>{t('weeklyPlan.progressLabel')}</Text>
            <Text style={styles.progressCount}>
              {progress.completed}/{progress.total}
            </Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
          </View>
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} size="large" />
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {regenerating && (
            <View style={styles.regenBanner}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={styles.regenText}>{t('weeklyPlan.regenerating')}</Text>
            </View>
          )}

          {plan?.days.map((day) => (
            <View key={day.dayIndex} style={styles.dayCard}>
              <Text style={styles.dayTitle}>{dayLabel(day.dayIndex)}</Text>
              {day.activities.length === 0 && (
                <Text style={styles.dayEmpty}>{t('weeklyPlan.noActivities')}</Text>
              )}
              {day.activities.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  style={[styles.activityRow, a.completed && styles.activityRowDone]}
                  onPress={() => a.kind !== 'rest' && handleToggle(day.dayIndex, a.id)}
                  activeOpacity={a.kind === 'rest' ? 1 : 0.7}
                >
                  <View style={[styles.activityIcon, { backgroundColor: KIND_COLORS[a.kind] + '20' }]}>
                    <Ionicons name={KIND_ICONS[a.kind] as any} size={18} color={KIND_COLORS[a.kind]} />
                  </View>
                  <View style={styles.activityBody}>
                    <Text style={[styles.activityTitle, a.completed && styles.activityTitleDone]}>
                      {a.kind === 'training' && a.courseId
                        ? t('weeklyPlan.activityTitles.practice_course', {
                            course: t(`owner.coursesPage.${a.courseId}.title`, { defaultValue: a.courseId }),
                          })
                        : a.kind === 'walk' && a.walkMinutes
                        ? t(`weeklyPlan.activityTitles.${a.titleKey}`, { min: a.walkMinutes })
                        : a.kind === 'guide' && a.issueId
                        ? t('weeklyPlan.activityTitles.review_guide', {
                            issue: t(`guides.${a.issueId}.title`, { defaultValue: a.issueId }),
                          })
                        : t(`weeklyPlan.activityTitles.${a.titleKey}`, { defaultValue: a.titleKey })}
                    </Text>
                    {a.kind !== 'rest' && (
                      <Text style={styles.activityMeta}>
                        {a.estimatedMinutes} {t('weeklyPlan.minutesAbbr')}
                      </Text>
                    )}
                  </View>
                  {a.kind !== 'rest' && (
                    <View style={[styles.checkbox, a.completed && styles.checkboxDone]}>
                      {a.completed && <Ionicons name="checkmark" size={16} color="#fff" />}
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          ))}

          <Text style={styles.footHint}>{t('weeklyPlan.tapHint')}</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  loader: { flex: 1 },
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },

  weekNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  navBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primary + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  weekLabelBox: { alignItems: 'center', flex: 1 },
  weekLabel: { fontSize: fontSize.md, fontWeight: '800', color: colors.text },
  todayLink: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '700', marginTop: 2 },

  progressBox: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  progressTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  progressCount: { fontSize: fontSize.sm, color: colors.text, fontWeight: '800' },
  progressBarBg: {
    height: 6, borderRadius: 3,
    backgroundColor: colors.backgroundSecondary,
    overflow: 'hidden',
  },
  progressBarFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },

  regenBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.sm, backgroundColor: colors.primary + '10',
    borderRadius: borderRadius.md,
  },
  regenText: { color: colors.primary, fontWeight: '700', fontSize: fontSize.sm },

  dayCard: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    ...shadow.sm,
  },
  dayTitle: {
    fontSize: fontSize.md, fontWeight: '800', color: colors.text,
    marginBottom: spacing.sm, textTransform: 'capitalize',
  },
  dayEmpty: { fontSize: fontSize.xs, color: colors.textLight, fontStyle: 'italic' },

  activityRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  activityRowDone: { opacity: 0.6 },
  activityIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  activityBody: { flex: 1 },
  activityTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  activityTitleDone: { textDecorationLine: 'line-through', color: colors.textSecondary },
  activityMeta: { fontSize: fontSize.xs, color: colors.textLight, marginTop: 2 },
  checkbox: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxDone: { backgroundColor: colors.primary, borderColor: colors.primary },

  footHint: {
    fontSize: fontSize.xs, color: colors.textLight,
    textAlign: 'center', marginTop: spacing.sm,
  },
});
