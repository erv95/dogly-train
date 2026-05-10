import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Switch,
  Platform,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  WeeklyAvailabilityDay,
  WeeklyAvailabilityWindow,
} from '../types';
import { colors, spacing, fontSize, borderRadius, shadow } from '../theme';

interface Props {
  weekly: WeeklyAvailabilityDay[];
  onChange: (next: WeeklyAvailabilityDay[]) => void;
}

const DAY_LABELS_LONG_KEYS = [
  'bookings.weekday.long.mon',
  'bookings.weekday.long.tue',
  'bookings.weekday.long.wed',
  'bookings.weekday.long.thu',
  'bookings.weekday.long.fri',
  'bookings.weekday.long.sat',
  'bookings.weekday.long.sun',
];

const DAY_LABELS_SHORT_KEYS = [
  'bookings.weekday.short.mon',
  'bookings.weekday.short.tue',
  'bookings.weekday.short.wed',
  'bookings.weekday.short.thu',
  'bookings.weekday.short.fri',
  'bookings.weekday.short.sat',
  'bookings.weekday.short.sun',
];

interface Preset {
  key: string;
  emoji: string;
  windows: WeeklyAvailabilityWindow[];
  daysIndices: number[];
}

const PRESETS: Preset[] = [
  {
    key: 'morning',
    emoji: '🌅',
    windows: [{ startMin: 9 * 60, endMin: 13 * 60 }],
    daysIndices: [0, 1, 2, 3, 4],
  },
  {
    key: 'afternoon',
    emoji: '🌇',
    windows: [{ startMin: 17 * 60, endMin: 20 * 60 }],
    daysIndices: [0, 1, 2, 3, 4],
  },
  {
    key: 'morning_afternoon',
    emoji: '☀️',
    windows: [
      { startMin: 9 * 60, endMin: 13 * 60 },
      { startMin: 16 * 60, endMin: 20 * 60 },
    ],
    daysIndices: [0, 1, 2, 3, 4],
  },
  {
    key: 'full_day',
    emoji: '🕘',
    windows: [{ startMin: 9 * 60, endMin: 19 * 60 }],
    daysIndices: [0, 1, 2, 3, 4],
  },
];

function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function dateToMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function minutesToDate(min: number): Date {
  const d = new Date();
  d.setHours(Math.floor(min / 60), min % 60, 0, 0);
  return d;
}

function snapTo30(min: number, dir: 'down' | 'up' = 'down'): number {
  if (dir === 'up') return Math.ceil(min / 30) * 30;
  return Math.floor(min / 30) * 30;
}

function windowsOverlap(a: WeeklyAvailabilityWindow, b: WeeklyAvailabilityWindow): boolean {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

function summarizeWindows(windows: WeeklyAvailabilityWindow[]): string {
  if (windows.length === 0) return '';
  return windows
    .slice()
    .sort((a, b) => a.startMin - b.startMin)
    .map((w) => `${fmtMin(w.startMin)}–${fmtMin(w.endMin)}`)
    .join(' · ');
}

export default function AvailabilityWeekEditor({ weekly, onChange }: Props) {
  const { t } = useTranslation();
  const [expandedDay, setExpandedDay] = useState<number | null>(null);

  // Add-range modal state. Both start and end are visible at once; tapping one
  // opens its own native picker independently — no fragile sequential flow.
  const [addingForDay, setAddingForDay] = useState<number | null>(null);
  const [draftStart, setDraftStart] = useState<number>(9 * 60);
  const [draftEnd, setDraftEnd] = useState<number>(13 * 60);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Copy-to modal
  const [copyFromDay, setCopyFromDay] = useState<number | null>(null);
  const [copyTargets, setCopyTargets] = useState<Set<number>>(new Set());

  // Preset confirmation modal
  const [pendingPreset, setPendingPreset] = useState<Preset | null>(null);

  const ensureLength = (input: WeeklyAvailabilityDay[]): WeeklyAvailabilityDay[] => {
    if (input.length === 7) return input;
    return Array.from({ length: 7 }, (_, i) =>
      input.find((d) => d.dayIndex === i) ?? { dayIndex: i, windows: [] },
    );
  };

  const safeWeekly = useMemo(() => ensureLength(weekly), [weekly]);

  const updateDay = (
    dayIndex: number,
    mutator: (windows: WeeklyAvailabilityWindow[]) => WeeklyAvailabilityWindow[],
  ) => {
    const next = safeWeekly.map((d) =>
      d.dayIndex === dayIndex
        ? { ...d, windows: mutator(d.windows).sort((a, b) => a.startMin - b.startMin) }
        : d,
    );
    onChange(next);
  };

  const replaceDay = (dayIndex: number, windows: WeeklyAvailabilityWindow[]) => {
    const next = safeWeekly.map((d) =>
      d.dayIndex === dayIndex ? { ...d, windows: [...windows] } : d,
    );
    onChange(next);
  };

  // ── Preset handling ────────────────────────────────────────────────────────

  const applyPreset = (preset: Preset, includeWeekend: boolean) => {
    const targetDays = includeWeekend ? [0, 1, 2, 3, 4, 5, 6] : preset.daysIndices;
    const next = safeWeekly.map((d) => {
      if (targetDays.includes(d.dayIndex)) {
        return { ...d, windows: preset.windows.map((w) => ({ ...w })) };
      }
      return d;
    });
    onChange(next);
    setPendingPreset(null);
  };

  // ── Add-range modal ────────────────────────────────────────────────────────

  const openAddWindow = (dayIndex: number) => {
    setAddingForDay(dayIndex);
    setDraftStart(9 * 60);
    setDraftEnd(13 * 60);
    setAddError(null);
    setShowStartPicker(false);
    setShowEndPicker(false);
  };

  const closeAddWindow = () => {
    setAddingForDay(null);
    setShowStartPicker(false);
    setShowEndPicker(false);
    setAddError(null);
  };

  /** Build an onChange handler shared by both pickers. Stable: always closes
   *  the picker and only commits the value on `event.type === 'set'`. */
  const handleStartPicker = (event: any, date?: Date) => {
    setShowStartPicker(false);
    if (event?.type === 'set' && date) {
      setDraftStart(snapTo30(dateToMinutes(date)));
      setAddError(null);
    }
  };
  const handleEndPicker = (event: any, date?: Date) => {
    setShowEndPicker(false);
    if (event?.type === 'set' && date) {
      setDraftEnd(snapTo30(dateToMinutes(date), 'up'));
      setAddError(null);
    }
  };

  const saveDraftRange = () => {
    if (addingForDay == null) return;
    if (draftEnd <= draftStart) {
      setAddError(t('bookings.editor.endAfterStart'));
      return;
    }
    const candidate: WeeklyAvailabilityWindow = {
      startMin: draftStart,
      endMin: draftEnd,
    };
    const dayWindows = safeWeekly[addingForDay].windows;
    if (dayWindows.some((w) => windowsOverlap(w, candidate))) {
      setAddError(t('bookings.editor.overlap'));
      return;
    }
    updateDay(addingForDay, (windows) => [...windows, candidate]);
    closeAddWindow();
  };

  const removeWindow = (dayIndex: number, idx: number) => {
    updateDay(dayIndex, (windows) => windows.filter((_, i) => i !== idx));
  };

  /** Open/closed switch. Closing clears the windows. Opening leaves the day
   *  empty (no auto-added default — user adds ranges via the "+ Add" button). */
  const toggleDayClosed = (dayIndex: number, makeOpen: boolean) => {
    if (!makeOpen) {
      replaceDay(dayIndex, []);
      return;
    }
    // Toggling to "open" with no ranges → just open the add-range modal so the
    // user can add their first window. If they cancel, the day stays empty.
    if (safeWeekly[dayIndex].windows.length === 0) {
      openAddWindow(dayIndex);
    }
  };

  // ── Copy-to flow ────────────────────────────────────────────────────────────

  const openCopyTo = (dayIndex: number) => {
    setCopyFromDay(dayIndex);
    setCopyTargets(new Set());
  };

  const toggleCopyTarget = (dayIndex: number) => {
    setCopyTargets((prev) => {
      const next = new Set(prev);
      if (next.has(dayIndex)) next.delete(dayIndex);
      else next.add(dayIndex);
      return next;
    });
  };

  const applyCopy = () => {
    if (copyFromDay == null) return;
    const source = safeWeekly[copyFromDay].windows;
    const next = safeWeekly.map((d) =>
      copyTargets.has(d.dayIndex) ? { ...d, windows: source.map((w) => ({ ...w })) } : d,
    );
    onChange(next);
    setCopyFromDay(null);
    setCopyTargets(new Set());
  };

  const quickCopyWeekdays = () => {
    if (copyFromDay == null) return;
    const source = safeWeekly[copyFromDay].windows;
    const next = safeWeekly.map((d) => {
      if (d.dayIndex === copyFromDay) return d;
      if (d.dayIndex >= 0 && d.dayIndex <= 4) {
        return { ...d, windows: source.map((w) => ({ ...w })) };
      }
      return d;
    });
    onChange(next);
    setCopyFromDay(null);
    setCopyTargets(new Set());
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Quick presets */}
      <View style={styles.presetsBlock}>
        <Text style={styles.sectionLabel}>{t('bookings.editor.presetsTitle')}</Text>
        <View style={styles.presetsGrid}>
          {PRESETS.map((p) => (
            <TouchableOpacity
              key={p.key}
              style={styles.presetCard}
              onPress={() => setPendingPreset(p)}
              activeOpacity={0.85}
            >
              <Text style={styles.presetEmoji}>{p.emoji}</Text>
              <Text style={styles.presetLabel}>{t(`bookings.editor.preset.${p.key}.label`)}</Text>
              <Text style={styles.presetSummary}>{summarizeWindows(p.windows)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.presetsHint}>{t('bookings.editor.presetsHint')}</Text>
      </View>

      {/* Per-day accordion */}
      <Text style={styles.sectionLabel}>{t('bookings.editor.byDay')}</Text>
      {safeWeekly.map((day) => {
        const closed = day.windows.length === 0;
        const expanded = expandedDay === day.dayIndex;
        const summary = closed
          ? t('bookings.editor.closedDay')
          : summarizeWindows(day.windows);
        return (
          <View key={day.dayIndex} style={styles.dayCard}>
            <TouchableOpacity
              style={styles.dayHeader}
              onPress={() => setExpandedDay(expanded ? null : day.dayIndex)}
              activeOpacity={0.85}
            >
              <View style={styles.dayHeaderLeft}>
                <View style={[styles.dayDot, !closed && styles.dayDotOpen]} />
                <Text style={styles.dayLabel}>
                  {t(DAY_LABELS_LONG_KEYS[day.dayIndex])}
                </Text>
              </View>
              <View style={styles.dayHeaderRight}>
                <Text style={[styles.daySummary, closed && styles.daySummaryClosed]} numberOfLines={1}>
                  {summary}
                </Text>
                <Ionicons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.textLight}
                />
              </View>
            </TouchableOpacity>

            {expanded && (
              <View style={styles.dayBody}>
                {/* Open / closed switch */}
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>
                    {closed ? t('bookings.editor.closed') : t('bookings.editor.open')}
                  </Text>
                  <Switch
                    value={!closed}
                    onValueChange={(v) => toggleDayClosed(day.dayIndex, v)}
                    trackColor={{ false: colors.border, true: colors.primary + '60' }}
                    thumbColor={!closed ? colors.primary : '#fff'}
                  />
                </View>

                {/* Existing ranges (only when day is open) */}
                {!closed && day.windows.map((w, i) => (
                  <View key={i} style={styles.rangeRow}>
                    <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                    <Text style={styles.rangeText}>
                      {fmtMin(w.startMin)} – {fmtMin(w.endMin)}
                    </Text>
                    <TouchableOpacity
                      onPress={() => removeWindow(day.dayIndex, i)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={20} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                ))}

                {/* Add range — always visible so a closed day can be re-opened */}
                <TouchableOpacity
                  style={styles.addBtn}
                  onPress={() => openAddWindow(day.dayIndex)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="add-circle" size={18} color={colors.primary} />
                  <Text style={styles.addBtnText}>{t('bookings.editor.addRange')}</Text>
                </TouchableOpacity>

                {/* Copy to others (only meaningful when there's something to copy) */}
                {!closed && (
                  <TouchableOpacity
                    style={styles.copyBtn}
                    onPress={() => openCopyTo(day.dayIndex)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="copy-outline" size={14} color={colors.textSecondary} />
                    <Text style={styles.copyBtnText}>{t('bookings.editor.copyTo')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        );
      })}

      {/* Add-range modal — both start + end visible, each opens its own picker */}
      <Modal
        visible={addingForDay !== null}
        transparent
        animationType="fade"
        onRequestClose={closeAddWindow}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={closeAddWindow}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
            <Ionicons name="time" size={32} color={colors.primary} />
            <Text style={styles.modalTitle}>{t('bookings.editor.addRange')}</Text>
            <Text style={styles.modalSubtitle}>
              {addingForDay != null && t('bookings.editor.addRangeSubtitle', {
                day: t(DAY_LABELS_LONG_KEYS[addingForDay]),
              })}
            </Text>

            <View style={styles.timeRow}>
              <View style={styles.timeCol}>
                <Text style={styles.timeColLabel}>{t('bookings.editor.startTime')}</Text>
                <TouchableOpacity
                  style={styles.timeBtn}
                  onPress={() => setShowStartPicker(true)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.timeBtnText}>{fmtMin(draftStart)}</Text>
                </TouchableOpacity>
              </View>
              <Ionicons name="arrow-forward" size={18} color={colors.textLight} />
              <View style={styles.timeCol}>
                <Text style={styles.timeColLabel}>{t('bookings.editor.endTime')}</Text>
                <TouchableOpacity
                  style={styles.timeBtn}
                  onPress={() => setShowEndPicker(true)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.timeBtnText}>{fmtMin(draftEnd)}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {addError && <Text style={styles.errorText}>{addError}</Text>}

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={closeAddWindow} style={styles.modalSideBtn}>
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSideBtn, styles.modalSideBtnPrimary]}
                onPress={saveDraftRange}
              >
                <Text style={styles.modalCtaText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>

            {/* Native pickers — mounted only while shown so each tap opens cleanly. */}
            {showStartPicker && (
              <DateTimePicker
                value={minutesToDate(draftStart)}
                mode="time"
                is24Hour
                minuteInterval={30 as any}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleStartPicker}
              />
            )}
            {showEndPicker && (
              <DateTimePicker
                value={minutesToDate(draftEnd)}
                mode="time"
                is24Hour
                minuteInterval={30 as any}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleEndPicker}
              />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Preset apply modal */}
      <Modal
        visible={pendingPreset !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingPreset(null)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setPendingPreset(null)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
            {pendingPreset && (
              <>
                <Text style={styles.modalEmoji}>{pendingPreset.emoji}</Text>
                <Text style={styles.modalTitle}>
                  {t(`bookings.editor.preset.${pendingPreset.key}.label`)}
                </Text>
                <Text style={styles.modalSubtitle}>{summarizeWindows(pendingPreset.windows)}</Text>
                <Text style={styles.modalQuestion}>{t('bookings.editor.preset.applyQuestion')}</Text>

                <TouchableOpacity
                  style={[styles.modalCta, styles.modalCtaPrimary]}
                  onPress={() => applyPreset(pendingPreset, false)}
                >
                  <Text style={styles.modalCtaText}>{t('bookings.editor.preset.applyWeekdays')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalCta, styles.modalCtaSecondary]}
                  onPress={() => applyPreset(pendingPreset, true)}
                >
                  <Text style={[styles.modalCtaText, styles.modalCtaSecondaryText]}>
                    {t('bookings.editor.preset.applyAll')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setPendingPreset(null)} style={styles.modalCancel}>
                  <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Copy-to modal */}
      <Modal
        visible={copyFromDay !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setCopyFromDay(null)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setCopyFromDay(null)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
            {copyFromDay !== null && (
              <>
                <Ionicons name="copy" size={28} color={colors.primary} />
                <Text style={styles.modalTitle}>{t('bookings.editor.copyTo')}</Text>
                <Text style={styles.modalSubtitle}>
                  {t('bookings.editor.copyFromHint', { day: t(DAY_LABELS_LONG_KEYS[copyFromDay]) })}
                </Text>

                {copyFromDay <= 4 && (
                  <TouchableOpacity
                    style={[styles.modalCta, styles.modalCtaPrimary]}
                    onPress={quickCopyWeekdays}
                  >
                    <Text style={styles.modalCtaText}>{t('bookings.editor.copyToWeekdays')}</Text>
                  </TouchableOpacity>
                )}

                <Text style={styles.modalSection}>{t('bookings.editor.orPickDays')}</Text>
                <View style={styles.copyChipsRow}>
                  {[0, 1, 2, 3, 4, 5, 6].filter((d) => d !== copyFromDay).map((d) => {
                    const active = copyTargets.has(d);
                    return (
                      <TouchableOpacity
                        key={d}
                        style={[styles.copyChip, active && styles.copyChipActive]}
                        onPress={() => toggleCopyTarget(d)}
                      >
                        <Text style={[styles.copyChipText, active && styles.copyChipTextActive]}>
                          {t(DAY_LABELS_SHORT_KEYS[d])}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity onPress={() => setCopyFromDay(null)} style={styles.modalSideBtn}>
                    <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modalSideBtn,
                      styles.modalSideBtnPrimary,
                      copyTargets.size === 0 && styles.modalCtaDisabled,
                    ]}
                    onPress={applyCopy}
                    disabled={copyTargets.size === 0}
                  >
                    <Text style={styles.modalCtaText}>{t('bookings.editor.applyCopy')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },

  sectionLabel: {
    fontSize: 10, fontWeight: '800', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: spacing.sm, marginBottom: 4,
  },

  presetsBlock: { gap: 6 },
  presetsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  presetCard: {
    flexBasis: '47%', flexGrow: 1,
    padding: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    borderWidth: 1, borderColor: colors.borderLight,
    alignItems: 'flex-start',
    ...shadow.sm,
  },
  presetEmoji: { fontSize: 22, marginBottom: 4 },
  presetLabel: { fontSize: fontSize.sm, fontWeight: '800', color: colors.text },
  presetSummary: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  presetsHint: { fontSize: fontSize.xs, color: colors.textLight, marginTop: 6, fontStyle: 'italic' },

  dayCard: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    ...shadow.sm,
  },
  dayHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.md,
  },
  dayHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  dayHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1.5 },
  dayDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dayDotOpen: { backgroundColor: colors.success },
  dayLabel: { fontSize: fontSize.md, fontWeight: '800', color: colors.text, textTransform: 'capitalize' },
  daySummary: { flex: 1, fontSize: fontSize.xs, color: colors.text, fontWeight: '600', textAlign: 'right' },
  daySummaryClosed: { color: colors.textLight, fontStyle: 'italic' },

  dayBody: {
    paddingHorizontal: spacing.md, paddingBottom: spacing.md, paddingTop: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.borderLight,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },

  rangeRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 8, paddingHorizontal: spacing.sm,
    backgroundColor: colors.primary + '10',
    borderRadius: borderRadius.md,
  },
  rangeText: { flex: 1, fontSize: fontSize.md, color: colors.text, fontWeight: '700', fontVariant: ['tabular-nums'] as any },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: colors.primary + '60',
  },
  addBtnText: { color: colors.primary, fontWeight: '800', fontSize: fontSize.sm },

  copyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 6,
  },
  copyBtnText: { color: colors.textSecondary, fontWeight: '700', fontSize: fontSize.xs },

  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.lg,
  },
  modalCard: {
    width: '100%', backgroundColor: colors.background,
    borderRadius: borderRadius.lg, padding: spacing.lg, gap: 6,
    alignItems: 'center', ...shadow.lg,
  },
  modalEmoji: { fontSize: 40, marginBottom: 4 },
  modalTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text, textAlign: 'center' },
  modalSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
  modalQuestion: {
    fontSize: fontSize.sm, color: colors.text, marginTop: spacing.sm,
    fontWeight: '700', textAlign: 'center',
  },
  modalSection: {
    fontSize: 10, fontWeight: '800', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: spacing.sm, alignSelf: 'flex-start',
  },
  modalCta: {
    width: '100%', paddingVertical: spacing.md, borderRadius: borderRadius.full,
    alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs,
  },
  modalCtaPrimary: { backgroundColor: colors.primary },
  modalCtaSecondary: { backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.primary },
  modalCtaText: { color: colors.textOnPrimary, fontWeight: '800', fontSize: fontSize.md },
  modalCtaSecondaryText: { color: colors.primary },
  modalCtaDisabled: { opacity: 0.4 },
  modalCancel: { paddingVertical: 6, marginTop: 4 },
  modalCancelText: { color: colors.textSecondary, fontWeight: '700' },

  // Time picker modal — both fields side by side
  timeRow: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    gap: spacing.sm, marginTop: spacing.md, width: '100%',
  },
  timeCol: { flex: 1, alignItems: 'center' },
  timeColLabel: {
    fontSize: 10, fontWeight: '800', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
  },
  timeBtn: {
    width: '100%',
    paddingVertical: spacing.md,
    backgroundColor: colors.primary + '15',
    borderRadius: borderRadius.md,
    alignItems: 'center',
    borderWidth: 1.5, borderColor: colors.primary + '40',
  },
  timeBtnText: {
    fontSize: 28, fontWeight: '900', color: colors.primary,
    letterSpacing: 1, fontVariant: ['tabular-nums'] as any,
  },
  errorText: {
    fontSize: fontSize.xs, color: colors.error, marginTop: spacing.sm, fontWeight: '700',
  },

  copyChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 4 },
  copyChip: {
    paddingHorizontal: spacing.sm + 2, paddingVertical: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1, borderColor: colors.border,
    minWidth: 56, alignItems: 'center',
  },
  copyChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  copyChipText: { fontSize: fontSize.xs, fontWeight: '800', color: colors.text },
  copyChipTextActive: { color: colors.textOnPrimary },

  modalActions: {
    flexDirection: 'row', gap: spacing.sm,
    width: '100%', marginTop: spacing.md,
  },
  modalSideBtn: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: borderRadius.full,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: 1, borderColor: colors.border,
  },
  modalSideBtnPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
});
