import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { OccurrenceAnalysis } from '../services/recurringBookings';
import { BOOKING_TIMEZONE } from '../config/booking';
import { colors, spacing, fontSize, borderRadius } from '../theme';

interface Props {
  visible: boolean;
  loading: boolean;
  /** Per-occurrence statuses, ordered by index. */
  occurrences: OccurrenceAnalysis[];
  /** True while the create call is in flight. */
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Bottom-sheet style modal listing every occurrence of a recurring series with
 * a green check (available) or a red cross (unavailable) plus the reason.
 *
 * - When all are available: title says "Listo para reservar" and primary CTA is
 *   "Reservar X semanas".
 * - When some are unavailable: title says "X de Y disponibles" and primary CTA
 *   becomes "Reservar X disponibles" — the user explicitly opts in to skipping.
 */
export function RecurringPreviewModal({
  visible, loading, occurrences, submitting, onCancel, onConfirm,
}: Props) {
  const { t } = useTranslation();

  const total = occurrences.length;
  const availableCount = occurrences.filter((o) => o.status === 'available').length;
  const allAvailable = availableCount === total && total > 0;
  const noneAvailable = availableCount === 0 && total > 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>
              {allAvailable
                ? t('bookings.recurring.preview.allOk')
                : t('bookings.recurring.preview.summary', {
                  available: availableCount,
                  total,
                })}
            </Text>
            <TouchableOpacity onPress={onCancel} hitSlop={12}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.loaderText}>{t('common.loading')}</Text>
            </View>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: spacing.md }}>
              {occurrences.map((o) => {
                const date = new Date(o.serviceAt);
                const dateLabel = date.toLocaleDateString(undefined, {
                  timeZone: BOOKING_TIMEZONE, weekday: 'short', day: 'numeric', month: 'short',
                });
                const timeLabel = date.toLocaleTimeString(undefined, {
                  timeZone: BOOKING_TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
                });
                const isOk = o.status === 'available';
                return (
                  <View key={o.index} style={[styles.row, !isOk && styles.rowDisabled]}>
                    <View style={[styles.bubble, { backgroundColor: isOk ? colors.success + '20' : colors.error + '15' }]}>
                      <Ionicons
                        name={isOk ? 'checkmark' : 'close'}
                        size={16}
                        color={isOk ? colors.success : colors.error}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowDate, !isOk && styles.rowDateDisabled]}>
                        {t('bookings.recurring.preview.weekN', { week: o.index + 1 })} · {dateLabel} · {timeLabel}
                      </Text>
                      <Text style={[styles.rowReason, isOk && styles.rowReasonOk]}>
                        {t(`bookings.recurring.preview.status.${o.status}`)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={onCancel} disabled={submitting}>
              <Text style={styles.btnSecondaryText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.btn,
                styles.btnPrimary,
                (loading || submitting || noneAvailable) && styles.btnDisabled,
              ]}
              onPress={onConfirm}
              disabled={loading || submitting || noneAvailable}
            >
              {submitting ? (
                <ActivityIndicator color={colors.textOnPrimary} />
              ) : (
                <Text style={styles.btnPrimaryText}>
                  {allAvailable
                    ? t('bookings.recurring.preview.confirmAll', { count: total })
                    : t('bookings.recurring.preview.confirmAvailable', { count: availableCount })}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
    maxHeight: '85%',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.text,
  },
  loaderWrap: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  loaderText: { fontSize: fontSize.sm, color: colors.textSecondary },
  list: {
    maxHeight: 420,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  rowDisabled: {
    opacity: 0.85,
  },
  bubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowDate: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.text,
  },
  rowDateDisabled: {
    color: colors.textSecondary,
  },
  rowReason: {
    fontSize: fontSize.xs,
    color: colors.error,
    marginTop: 2,
  },
  rowReasonOk: {
    color: colors.success,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  btn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { color: colors.textOnPrimary, fontWeight: '800' },
  btnSecondary: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  btnSecondaryText: { color: colors.text, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },
});
