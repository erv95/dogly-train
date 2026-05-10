import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  WeeklyAvailability,
} from '../types';
import { madridParts, slotIdsForRange, windowsForDate } from '../services/availability';
import { getProviderOccupiedSlots } from '../services/bookings';
import { SLOT_MINUTES } from '../config/booking';
import { colors, spacing, fontSize, borderRadius, shadow } from '../theme';

interface Props {
  providerId: string;
  availability: WeeklyAvailability;
  durationMinutes: number;
  /** UTC ms — when set, it's the slot the user has chosen. */
  selectedSlotStart: number | null;
  onSelectSlotStart: (utcMillis: number | null) => void;
}

const DAY_LABELS_KEYS = [
  'bookings.weekday.short.mon',
  'bookings.weekday.short.tue',
  'bookings.weekday.short.wed',
  'bookings.weekday.short.thu',
  'bookings.weekday.short.fri',
  'bookings.weekday.short.sat',
  'bookings.weekday.short.sun',
];

/** Returns the next 60 days as an array of { date, dayIndex, isoDate, hasAvailability }
 *  — single pass, all in Europe/Madrid. */
function buildDaysGrid(availability: WeeklyAvailability) {
  const out: Array<{ utcStart: Date; isoDate: string; dayLabel: string; dayNum: string; hasAvailability: boolean }> = [];
  const now = new Date();
  for (let i = 0; i < availability.maxHorizonDays; i++) {
    // Step in 24h chunks anchored to the start of "today" in UTC.
    const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const parts = madridParts(d);
    const windows = windowsForDate(availability, parts.isoDate, parts.dayIndex);
    out.push({
      utcStart: d,
      isoDate: parts.isoDate,
      dayLabel: DAY_LABELS_KEYS[parts.dayIndex],
      dayNum: String(parts.day),
      hasAvailability: windows.length > 0,
    });
  }
  return out;
}

/** Generates UTC slot start times for a Madrid date inside the windows,
 *  stepping by SLOT_MINUTES. Skips slots that would be in the past or that
 *  require a continuous block of `durationMinutes` not fitting in a window. */
function buildSlotsForDate(
  isoDate: string,
  windows: { startMin: number; endMin: number }[],
  durationMinutes: number,
  now: Date,
): number[] {
  const out: number[] = [];
  const minLeadMs = 0; // server enforces minLead; UI just hides past-time
  for (const w of windows) {
    for (let min = w.startMin; min + durationMinutes <= w.endMin; min += SLOT_MINUTES) {
      // Convert "isoDate Madrid HH:MM" to UTC. We do this by trying a UTC
      // candidate matching the wall-clock and validating its Madrid parts.
      const [y, m, d] = isoDate.split('-').map((s) => parseInt(s, 10));
      const h = Math.floor(min / 60);
      const mm = min % 60;
      // Naïve UTC guess assuming Madrid offset = +1 (winter) or +2 (summer).
      // We'll compute both and pick the one whose madridParts match.
      for (const offset of [1, 2]) {
        const candidate = new Date(Date.UTC(y, m - 1, d, h - offset, mm));
        const p = madridParts(candidate);
        if (p.isoDate === isoDate && p.hour === h && p.minute === mm) {
          if (candidate.getTime() > now.getTime() + minLeadMs) {
            out.push(candidate.getTime());
          }
          break;
        }
      }
    }
  }
  return out;
}

export default function BookingSlotPicker({
  providerId,
  availability,
  durationMinutes,
  selectedSlotStart,
  onSelectSlotStart,
}: Props) {
  const { t } = useTranslation();
  const days = useMemo(() => buildDaysGrid(availability), [availability]);
  const [selectedDayIdx, setSelectedDayIdx] = useState<number>(() =>
    days.findIndex((d) => d.hasAvailability),
  );
  const [occupiedIds, setOccupiedIds] = useState<string[]>([]);
  const [loadingDay, setLoadingDay] = useState(false);

  const selectedDay = selectedDayIdx >= 0 ? days[selectedDayIdx] : null;

  // Load occupied slot IDs for the selected day so we can grey them out and
  // tachar (strike-through) them. Uses the server-side CF — works for any
  // authenticated user regardless of whether they own/provide the bookings.
  useEffect(() => {
    if (!selectedDay) return;
    let cancelled = false;
    (async () => {
      setLoadingDay(true);
      try {
        const dayStart = (() => {
          const [y, m, d] = selectedDay.isoDate.split('-').map((s) => parseInt(s, 10));
          // Madrid 00:00 is UTC -1 (winter) or -2 (summer). Over-fetch a 36h
          // window to be safe, the server caps the range to 14 days max.
          return new Date(Date.UTC(y, m - 1, d - 1, 22, 0));
        })();
        const dayEnd = new Date(dayStart.getTime() + 36 * 60 * 60 * 1000);
        const ids = await getProviderOccupiedSlots(providerId, dayStart.getTime(), dayEnd.getTime());
        if (!cancelled) setOccupiedIds(ids);
      } finally {
        if (!cancelled) setLoadingDay(false);
      }
    })();
    return () => { cancelled = true; };
  }, [providerId, selectedDay?.isoDate]);

  const slots = useMemo(() => {
    if (!selectedDay) return [];
    const windows = windowsForDate(availability, selectedDay.isoDate, madridParts(selectedDay.utcStart).dayIndex);
    return buildSlotsForDate(selectedDay.isoDate, windows, durationMinutes, new Date());
  }, [selectedDay, availability, durationMinutes]);

  const occupiedSlotIds = useMemo(() => new Set(occupiedIds), [occupiedIds]);

  const fmtMin = (utcMs: number) => {
    const p = madridParts(new Date(utcMs));
    return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      {/* Day strip */}
      <Text style={styles.sectionTitle}>{t('bookings.picker.pickDay')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}>
        {days.map((d, i) => {
          const active = i === selectedDayIdx;
          return (
            <TouchableOpacity
              key={d.isoDate}
              style={[
                styles.dayBox,
                active && styles.dayBoxActive,
                !d.hasAvailability && styles.dayBoxDisabled,
              ]}
              onPress={() => d.hasAvailability && setSelectedDayIdx(i)}
              disabled={!d.hasAvailability}
              activeOpacity={0.85}
            >
              <Text style={[styles.dayBoxLabel, active && styles.dayBoxLabelActive]}>
                {t(d.dayLabel)}
              </Text>
              <Text style={[styles.dayBoxNum, active && styles.dayBoxNumActive]}>{d.dayNum}</Text>
              {d.hasAvailability && <View style={[styles.dot, active && styles.dotActive]} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Slots */}
      <Text style={styles.sectionTitle}>{t('bookings.picker.pickTime')}</Text>
      {loadingDay ? (
        <ActivityIndicator color={colors.primary} style={{ paddingVertical: spacing.lg }} />
      ) : slots.length === 0 ? (
        <View style={styles.emptySlots}>
          <Ionicons name="calendar-outline" size={32} color={colors.textLight} />
          <Text style={styles.emptyText}>{t('bookings.picker.noSlots')}</Text>
        </View>
      ) : (
        <View style={styles.slotsGrid}>
          {slots.map((utcMs) => {
            const sids = slotIdsForRange(utcMs, durationMinutes);
            const occupied = sids.some((s) => occupiedSlotIds.has(s));
            const active = selectedSlotStart === utcMs;
            return (
              <TouchableOpacity
                key={utcMs}
                style={[
                  styles.slotChip,
                  active && styles.slotChipActive,
                  occupied && styles.slotChipDisabled,
                ]}
                onPress={() => !occupied && onSelectSlotStart(active ? null : utcMs)}
                disabled={occupied}
                activeOpacity={0.85}
              >
                <Text style={[
                  styles.slotChipText,
                  active && styles.slotChipTextActive,
                  occupied && styles.slotChipTextDisabled,
                ]}>
                  {fmtMin(utcMs)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },

  sectionTitle: {
    fontSize: 10, fontWeight: '800', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.sm,
  },

  dayStrip: { gap: 6, paddingVertical: 4 },
  dayBox: {
    width: 60, paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center',
    ...shadow.sm,
  },
  dayBoxActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayBoxDisabled: { opacity: 0.4, backgroundColor: colors.backgroundSecondary },
  dayBoxLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: '700', textTransform: 'uppercase' },
  dayBoxLabelActive: { color: colors.textOnPrimary },
  dayBoxNum: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text, marginTop: 2 },
  dayBoxNumActive: { color: colors.textOnPrimary },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.success, marginTop: 4 },
  dotActive: { backgroundColor: colors.textOnPrimary },

  slotsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, paddingVertical: 4 },
  slotChip: {
    paddingHorizontal: spacing.sm + 2, paddingVertical: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
    borderWidth: 1, borderColor: colors.border,
    minWidth: 64, alignItems: 'center',
  },
  slotChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  slotChipDisabled: {
    backgroundColor: colors.error + '12',
    borderColor: colors.error + '40',
  },
  slotChipText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  slotChipTextActive: { color: colors.textOnPrimary },
  slotChipTextDisabled: {
    color: colors.error,
    textDecorationLine: 'line-through',
    textDecorationColor: colors.error,
  },

  emptySlots: { alignItems: 'center', gap: 6, padding: spacing.lg },
  emptyText: { color: colors.textSecondary, fontSize: fontSize.sm, textAlign: 'center' },
});
