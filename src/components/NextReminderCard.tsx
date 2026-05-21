import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useDogStats } from '../contexts/DogStatsContext';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../theme';

/**
 * Surfaces the soonest open reminder for a dog (Iter 8.7.3).
 *
 * Shows nothing when there are no pending reminders — the Hoy screen
 * just collapses smoothly. Tap routes to the dog's health screen
 * (Recordatorios tab) where the user can mark it done or add more.
 *
 * Picks the soonest `dueAt` from `getDogReminders(dogId, userId)` (which
 * already filters `completedAt == null` and orders ascending).
 */
interface Props {
  dogId: string;
}

const TYPE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  vaccine: 'medkit',
  vet: 'fitness',
  grooming: 'cut',
  other: 'alarm',
};

const TYPE_COLOR: Record<string, string> = {
  vaccine: '#10B981',
  vet: '#EF4444',
  grooming: '#3B82F6',
  other: '#F59E0B',
};

function daysUntil(dueAt: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueAt);
  due.setHours(0, 0, 0, 0);
  const ms = due.getTime() - today.getTime();
  return Math.round(ms / 86400000);
}

export default function NextReminderCard({ dogId }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  // Reminders + load state come from the shared DogStatsContext
  // (HIGH-8 of Iter 8.7.6). The dogId prop is preserved for navigation.
  const { reminders, partialFailure, refresh } = useDogStats();
  const reminder = reminders[0] ?? null;

  if (partialFailure && !reminder) {
    return (
      <TouchableOpacity
        style={[styles.card, styles.errorCard]}
        onPress={() => { refresh(); }}
        activeOpacity={0.85}
      >
        <View style={[styles.iconCircle, { backgroundColor: colors.error + '22' }]}>
          <Ionicons name="cloud-offline-outline" size={20} color={colors.error} />
        </View>
        <View style={styles.body}>
          <Text style={[styles.label, { color: colors.error }]}>
            {t('reminders.loadErrorLabel')}
          </Text>
          <Text style={styles.title} numberOfLines={1}>
            {t('reminders.loadErrorRetry')}
          </Text>
        </View>
        <Ionicons name="refresh" size={18} color={colors.error} />
      </TouchableOpacity>
    );
  }

  if (!reminder) return null;

  const dueDate = reminder.dueAt.toDate();
  const days = daysUntil(dueDate);
  const icon = TYPE_ICON[reminder.type] ?? TYPE_ICON.other;
  const tint = TYPE_COLOR[reminder.type] ?? TYPE_COLOR.other;

  // Days-until copy: overdue, today, tomorrow, in N days.
  let timing: string;
  if (days < 0) timing = t('reminders.overdueDays', { count: Math.abs(days) });
  else if (days === 0) timing = t('reminders.today');
  else if (days === 1) timing = t('reminders.tomorrow');
  else timing = t('reminders.inDays', { count: days });

  return (
    <TouchableOpacity
      style={[styles.card, { borderColor: tint + '40', backgroundColor: tint + '10' }]}
      onPress={() => router.push(`/(shared)/dog-health/${dogId}?tab=reminders`)}
      activeOpacity={0.85}
    >
      <View style={[styles.iconCircle, { backgroundColor: tint + '22' }]}>
        <Ionicons name={icon} size={20} color={tint} />
      </View>
      <View style={styles.body}>
        <Text style={[styles.label, { color: tint }]}>{timing.toUpperCase()}</Text>
        <Text style={styles.title} numberOfLines={1}>{reminder.title}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={tint} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  errorCard: {
    borderColor: colors.error + '50',
    backgroundColor: colors.error + '0E',
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 11,
    fontFamily: fontFamily.bold,
    letterSpacing: 0.5,
  },
  title: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.semibold,
    color: colors.text,
  },
});
