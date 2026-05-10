import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Dog } from '../types';
import { getDogStats, DogStats, getLevelInfo } from '../services/dogStats';
import { getDogReminders } from '../services/reminders';
import { getDogWalks } from '../services/dogWalks';
import { getEmergencyContacts } from '../services/emergencyContacts';
import { DogWalk } from '../types';
import {
  getDailyRecommendations,
  getGreetingSlot,
  DailyRecommendation,
} from '../services/dailyRecommendations';
import { colors, spacing, fontSize, borderRadius, shadow } from '../theme';

interface Props {
  /** Pre-loaded dog (avoids the rail querying Firestore for it). */
  dog: Dog;
  /** Optional secondary dogs to show a small selector chip. */
  otherDogs?: Dog[];
  onChangeDog?: (dogId: string) => void;
}

export default function DailyTipsRail({ dog, otherDogs = [], onChangeDog }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const { firebaseUser, userData } = useAuth();

  const [stats, setStats] = useState<DogStats | null>(null);
  const [reminders, setReminders] = useState<any[]>([]);
  const [walks, setWalks] = useState<DogWalk[]>([]);
  const [hasEmergencyContacts, setHasEmergencyContacts] = useState<boolean | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!firebaseUser || !dog?.id) return;
    setLoading(true);
    try {
      const [s, r, w, ec] = await Promise.all([
        getDogStats(dog.id).catch(() => null),
        getDogReminders(dog.id, firebaseUser.uid).catch(() => []),
        getDogWalks(dog.id, firebaseUser.uid, 30).catch(() => []),
        getEmergencyContacts(firebaseUser.uid).catch(() => []),
      ]);
      setStats(s);
      setReminders(r);
      setWalks(w);
      setHasEmergencyContacts(ec.length > 0);
    } finally {
      setLoading(false);
    }
  }, [dog?.id, firebaseUser]);

  useEffect(() => {
    load();
  }, [load]);

  const recommendations: DailyRecommendation[] = useMemo(
    () => getDailyRecommendations({ dog, stats, reminders, walks, hasEmergencyContacts, now: new Date() }),
    [dog, stats, reminders, walks, hasEmergencyContacts]
  );

  const greetingKey = `daily.${getGreetingSlot(new Date())}`;
  const userName = userData?.displayName?.split(' ')[0] ?? '';

  return (
    <View style={styles.container}>
      {/* Greeting (centered) + dog mini-stats */}
      <View style={styles.headerTextBlock}>
        <Text style={styles.greeting} numberOfLines={1}>
          {userName ? t(greetingKey + 'Named', { name: userName }) : t(greetingKey)}
        </Text>
        <Text style={styles.subhead} numberOfLines={1}>
          {t('daily.forDog', { name: dog.name })}
        </Text>
        {stats && (
          <View style={styles.miniStatsRow}>
            <View style={styles.miniStat}>
              <Text style={styles.miniStatEmoji}>{getLevelInfo(stats.level).emoji}</Text>
              <Text style={styles.miniStatValue}>{t('progress.level')} {stats.level}</Text>
            </View>
            <View style={styles.miniStatDot} />
            <View style={styles.miniStat}>
              <Text style={styles.miniStatEmoji}>⚡</Text>
              <Text style={styles.miniStatValue}>{stats.xp} XP</Text>
            </View>
            {stats.currentStreak > 0 && (
              <>
                <View style={styles.miniStatDot} />
                <View style={styles.miniStat}>
                  <Text style={styles.miniStatEmoji}>🔥</Text>
                  <Text style={styles.miniStatValue}>{stats.currentStreak}d</Text>
                </View>
              </>
            )}
          </View>
        )}
      </View>

      {/* Dog selector — full width row below greeting, only when there are multiple dogs */}
      {otherDogs.length > 0 && onChangeDog && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dogChipsRow}
        >
          {/* Dedup by id — `otherDogs` may include the selected dog when the
              caller hasn't filtered (e.g. before a `selectedDogId` is set). */}
          {Array.from(new Map([dog, ...otherDogs].map((d) => [d.id, d])).values()).map((d) => {
            const active = d.id === dog.id;
            return (
              <TouchableOpacity
                key={d.id}
                onPress={() => onChangeDog(d.id)}
                style={[styles.dogChip, active && styles.dogChipActive]}
                activeOpacity={0.7}
              >
                <Text style={[styles.dogChipText, active && styles.dogChipTextActive]} numberOfLines={1}>
                  {d.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : recommendations.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>{t('daily.allCaughtUp')}</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
        >
          {recommendations.map((rec, idx) => (
            <RecommendationCard
              key={`${rec.kind}-${idx}`}
              rec={rec}
              dogId={dog.id}
              dogName={dog.name}
              onPressCourse={() =>
                router.push({
                  pathname: '/(shared)/courses',
                  params: { dogId: dog.id, dogName: encodeURIComponent(dog.name) },
                })
              }
              onPressGuide={(issueId) =>
                router.push(`/(shared)/behavior-guides/${issueId}`)
              }
              onPressReminder={() =>
                router.push({
                  pathname: '/(shared)/dog-health/[dogId]',
                  params: { dogId: dog.id, dogName: encodeURIComponent(dog.name) },
                })
              }
              onPressWalk={() =>
                router.push({
                  pathname: '/(shared)/dog-health/[dogId]',
                  params: { dogId: dog.id, dogName: encodeURIComponent(dog.name), tab: 'walks' },
                })
              }
              onPressPlan={() =>
                router.push(`/(shared)/training-prefs/${dog.id}`)
              }
              onPressEmergency={() => router.push('/(shared)/emergency')}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

function RecommendationCard({
  rec,
  dogId,
  dogName,
  onPressCourse,
  onPressGuide,
  onPressReminder,
  onPressWalk,
  onPressPlan,
  onPressEmergency,
}: {
  rec: DailyRecommendation;
  dogId: string;
  dogName: string;
  onPressCourse: () => void;
  onPressGuide: (issueId: string) => void;
  onPressReminder: () => void;
  onPressWalk: () => void;
  onPressPlan: () => void;
  onPressEmergency: () => void;
}) {
  const { t } = useTranslation();

  switch (rec.kind) {
    case 'reminder': {
      const overdue = rec.overdue;
      const today = rec.daysUntil === 0;
      const accent = overdue ? '#EF4444' : today ? '#F59E0B' : '#3B82F6';
      const label = overdue
        ? t('daily.reminderOverdue', { days: Math.abs(rec.daysUntil) })
        : today
          ? t('daily.reminderToday')
          : t('daily.reminderTomorrow');
      return (
        <TouchableOpacity style={[styles.card, { borderColor: accent + '50' }]} onPress={onPressReminder} activeOpacity={0.85}>
          <View style={[styles.cardIcon, { backgroundColor: accent + '20' }]}>
            <Ionicons name="medkit" size={22} color={accent} />
          </View>
          <Text style={[styles.cardLabel, { color: accent }]}>{label}</Text>
          <Text style={styles.cardTitle} numberOfLines={2}>{rec.title}</Text>
          <Text style={styles.cardCta}>{t('daily.viewReminder')} →</Text>
        </TouchableOpacity>
      );
    }
    case 'course': {
      const reasonLabel = t(`daily.courseReason.${rec.reasonKey}`);
      return (
        <TouchableOpacity style={[styles.card, { borderColor: colors.primary + '50' }]} onPress={onPressCourse} activeOpacity={0.85}>
          <View style={[styles.cardIcon, { backgroundColor: colors.primary + '15' }]}>
            <Text style={{ fontSize: 24 }}>{rec.emoji}</Text>
          </View>
          <Text style={[styles.cardLabel, { color: colors.primary }]}>{reasonLabel}</Text>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {t(`owner.coursesPage.${rec.courseId}.title`)}
          </Text>
          <Text style={styles.cardCta}>{t('daily.startCourse')} →</Text>
        </TouchableOpacity>
      );
    }
    case 'guide': {
      const accent = '#8B5CF6';
      return (
        <TouchableOpacity style={[styles.card, { borderColor: accent + '50' }]} onPress={() => onPressGuide(rec.issueId)} activeOpacity={0.85}>
          <View style={[styles.cardIcon, { backgroundColor: accent + '20' }]}>
            <Ionicons name="library" size={22} color={accent} />
          </View>
          <Text style={[styles.cardLabel, { color: accent }]}>{t('daily.guideForDog')}</Text>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {t(`guides.${rec.issueId}.title`)}
          </Text>
          <Text style={styles.cardCta}>{t('daily.readGuide')} →</Text>
        </TouchableOpacity>
      );
    }
    case 'streak': {
      const accent = '#F97316';
      return (
        <View style={[styles.card, { borderColor: accent + '50', backgroundColor: '#FEF3C7' }]}>
          <View style={[styles.cardIcon, { backgroundColor: accent + '20' }]}>
            <Text style={{ fontSize: 24 }}>🔥</Text>
          </View>
          <Text style={[styles.cardLabel, { color: accent }]}>{t('daily.streakLabel')}</Text>
          <Text style={styles.cardTitle}>{t('daily.streakDays', { count: rec.currentStreak })}</Text>
          <Text style={styles.cardCta}>{t('daily.keepItUp')}</Text>
        </View>
      );
    }
    case 'level_progress': {
      const accent = '#10B981';
      return (
        <View style={[styles.card, { borderColor: accent + '50' }]}>
          <View style={[styles.cardIcon, { backgroundColor: accent + '20' }]}>
            <Ionicons name="trophy" size={22} color={accent} />
          </View>
          <Text style={[styles.cardLabel, { color: accent }]}>{t('daily.levelClose')}</Text>
          <Text style={styles.cardTitle}>{t('daily.xpToNext', { xp: rec.xpToNext })}</Text>
          <Text style={styles.cardCta}>{t('daily.almostThere')}</Text>
        </View>
      );
    }
    case 'no_plan': {
      const accent = colors.primary;
      return (
        <TouchableOpacity style={[styles.card, { borderColor: accent + '50' }]} onPress={onPressPlan} activeOpacity={0.85}>
          <View style={[styles.cardIcon, { backgroundColor: accent + '15' }]}>
            <Ionicons name="sparkles" size={22} color={accent} />
          </View>
          <Text style={[styles.cardLabel, { color: accent }]}>{t('daily.personalize')}</Text>
          <Text style={styles.cardTitle}>{t('daily.takeQuestionnaire')}</Text>
          <Text style={styles.cardCta}>{t('daily.start')} →</Text>
        </TouchableOpacity>
      );
    }
    case 'walk_today': {
      const accent = '#16A34A';
      return (
        <TouchableOpacity style={[styles.card, { borderColor: accent + '50' }]} onPress={onPressWalk} activeOpacity={0.85}>
          <View style={[styles.cardIcon, { backgroundColor: accent + '20' }]}>
            <Ionicons name="walk" size={22} color={accent} />
          </View>
          <Text style={[styles.cardLabel, { color: accent }]}>{t('walks.tabTitle')}</Text>
          <Text style={styles.cardTitle}>{t('walks.noWalkToday')}</Text>
          <Text style={styles.cardCta}>{t('walks.registerWalk')} →</Text>
        </TouchableOpacity>
      );
    }
    case 'progress_summary': {
      const accent = '#0EA5E9';
      return (
        <View style={[styles.card, styles.cardAccented, { borderTopColor: accent }]}>
          <View style={[styles.cardIcon, { backgroundColor: accent + '20' }]}>
            <Ionicons name="stats-chart" size={22} color={accent} />
          </View>
          <Text style={[styles.cardLabel, { color: accent }]}>{t('daily.progressLabel')}</Text>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {t('daily.progressSummary', { count: rec.coursesCompleted })}
          </Text>
          <Text style={styles.cardCta}>{t('daily.proudOfYou')}</Text>
        </View>
      );
    }
    case 'daily_tip': {
      const accent = '#A855F7';
      // Resolve the tip from locale array; fallback to a generic one if missing
      const tips = (t('daily.tips', { returnObjects: true, defaultValue: [] }) as unknown);
      const tipsArr = Array.isArray(tips) ? (tips as string[]) : [];
      const tip = tipsArr.length > 0 ? tipsArr[rec.tipIndex % tipsArr.length] : '';
      return (
        <View style={[styles.card, styles.cardAccented, { borderTopColor: accent }]}>
          <View style={[styles.cardIcon, { backgroundColor: accent + '20' }]}>
            <Ionicons name="bulb" size={22} color={accent} />
          </View>
          <Text style={[styles.cardLabel, { color: accent }]}>{t('daily.tipLabel')}</Text>
          <Text style={styles.cardTitle} numberOfLines={4}>{tip}</Text>
        </View>
      );
    }
    case 'emergency_setup': {
      const accent = colors.error;
      return (
        <TouchableOpacity style={[styles.card, { borderColor: accent + '60' }]} onPress={onPressEmergency} activeOpacity={0.85}>
          <View style={[styles.cardIcon, { backgroundColor: accent + '20' }]}>
            <Ionicons name="warning" size={22} color={accent} />
          </View>
          <Text style={[styles.cardLabel, { color: accent }]}>{t('emergency.daily.label')}</Text>
          <Text style={styles.cardTitle} numberOfLines={3}>{t('emergency.daily.message')}</Text>
          <Text style={styles.cardCta}>{t('emergency.daily.cta')} →</Text>
        </TouchableOpacity>
      );
    }
  }
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.primary + '0C',
    paddingVertical: spacing.md,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.primary + '30',
  },
  headerTextBlock: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    alignItems: 'center',
  },
  greeting: {
    fontSize: fontSize.lg,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  subhead: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
    fontWeight: '600',
  },
  miniStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.xs,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  miniStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  miniStatEmoji: { fontSize: 13 },
  miniStatValue: { fontSize: 11, fontWeight: '800', color: colors.text },
  miniStatDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.textLight },
  dogChipsRow: {
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
    paddingBottom: spacing.sm,
  },
  dogChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 120,
  },
  dogChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dogChipText: { fontSize: 11, fontWeight: '700', color: colors.text },
  dogChipTextActive: { color: '#fff' },

  loadingBox: { padding: spacing.lg, alignItems: 'center' },
  emptyBox: { padding: spacing.md, alignItems: 'center' },
  emptyText: { fontSize: fontSize.sm, color: colors.textSecondary, fontStyle: 'italic' },

  rail: { paddingHorizontal: spacing.md, gap: spacing.sm, paddingBottom: spacing.xs },
  card: {
    width: 220,
    minHeight: 160,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    padding: spacing.md,
    gap: 6,
    ...shadow.sm,
  },
  // Variant for "passive" cards (progress summary, daily tip): solid white background
  // with a thick coloured top edge that doubles as a visual tag — avoids the muddy
  // look of stacking a tinted card on top of the tinted rail background.
  cardAccented: {
    borderColor: colors.border,
    borderTopWidth: 5,
  },
  cardIcon: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text, lineHeight: 18 },
  cardCta: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '700', marginTop: 'auto' },
});
