import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Dispute, DisputeReason } from '../types';
import { openDispute, getDisputesForBooking } from '../services/disputes';
import { useHaptics } from '../hooks/useHaptics';
import { colors, spacing, fontSize, borderRadius } from '../theme';

/**
 * Lives in the booking detail screen. Shows existing dispute status (if any)
 * for either side, plus a "Report a problem" CTA that opens a reason-picker
 * modal. Server creates the dispute; the screen re-fetches afterwards so the
 * status badge appears instantly.
 */

interface Props {
  bookingId: string;
  currentUserId: string;
  /** Booking must be in one of these statuses for the CTA to appear. */
  bookingStatus: string;
}

const REASONS: DisputeReason[] = [
  'no_show',
  'poor_service',
  'safety_concern',
  'payment_issue',
  'inappropriate_behavior',
  'other',
];

const STATUS_COLORS: Record<string, { fg: string; bg: string; icon: any }> = {
  open: { fg: '#F59E0B', bg: '#F59E0B22', icon: 'alert-circle-outline' },
  resolved: { fg: '#27AE60', bg: '#27AE6022', icon: 'checkmark-circle-outline' },
  rejected: { fg: '#9CA3AF', bg: '#9CA3AF22', icon: 'close-circle-outline' },
};

export function DisputeBlock({ bookingId, currentUserId, bookingStatus }: Props) {
  const { t } = useTranslation();
  const haptics = useHaptics();
  const [disputes, setDisputes] = useState<Dispute[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [reason, setReason] = useState<DisputeReason>('poor_service');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await getDisputesForBooking(bookingId);
      setDisputes(list);
    } catch {
      setDisputes([]);
    }
  }, [bookingId]);

  useEffect(() => { load(); }, [load]);

  if (disputes === null) return null;

  const mine = disputes.find((d) => d.openedBy === currentUserId);
  const fromOther = disputes.find((d) => d.openedBy !== currentUserId);

  // Disputes are only meaningful for booking states where service happened or
  // was supposed to happen. Skip while booking is in confirmed pre-service
  // limbo — UX-wise we surface it once it's "completed" or "expired".
  const canReport = bookingStatus === 'completed'
    || bookingStatus === 'expired'
    || bookingStatus === 'cancelled_by_owner'
    || bookingStatus === 'cancelled_by_provider'
    || bookingStatus === 'confirmed';

  const submit = async () => {
    if (description.trim().length < 5) {
      Alert.alert(t('common.error'), t('dispute.errors.tooShort'));
      return;
    }
    setSubmitting(true);
    try {
      await openDispute(bookingId, reason, description.trim());
      haptics.success();
      setModalOpen(false);
      setDescription('');
      setReason('poor_service');
      await load();
      Alert.alert(t('dispute.successTitle'), t('dispute.successBody'));
    } catch (err: any) {
      haptics.error();
      const code = err?.message ?? 'unknown';
      const msg = code === 'rate_limited'
        ? t('dispute.errors.rateLimited')
        : t('dispute.errors.generic');
      Alert.alert(t('common.error'), msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.wrap}>
      {/* Existing dispute (mine) */}
      {mine && (
        <View style={[styles.statusCard, { backgroundColor: STATUS_COLORS[mine.status].bg }]}>
          <Ionicons name={STATUS_COLORS[mine.status].icon} size={20} color={STATUS_COLORS[mine.status].fg} />
          <View style={styles.statusBody}>
            <Text style={[styles.statusTitle, { color: STATUS_COLORS[mine.status].fg }]}>
              {t(`dispute.statusYours.${mine.status}`)}
            </Text>
            <Text style={styles.statusReason}>{t(`dispute.reasons.${mine.reason}`)}</Text>
            {mine.resolution ? (
              <Text style={styles.statusResolution}>{mine.resolution}</Text>
            ) : null}
          </View>
        </View>
      )}

      {/* Dispute opened by counter-party (for transparency, only if currentUser hasn't filed too) */}
      {!mine && fromOther && (
        <View style={[styles.statusCard, { backgroundColor: STATUS_COLORS[fromOther.status].bg }]}>
          <Ionicons name={STATUS_COLORS[fromOther.status].icon} size={20} color={STATUS_COLORS[fromOther.status].fg} />
          <View style={styles.statusBody}>
            <Text style={[styles.statusTitle, { color: STATUS_COLORS[fromOther.status].fg }]}>
              {t(`dispute.statusOther.${fromOther.status}`)}
            </Text>
            <Text style={styles.statusReason}>{t(`dispute.reasons.${fromOther.reason}`)}</Text>
          </View>
        </View>
      )}

      {/* CTA only if user hasn't filed one yet */}
      {!mine && canReport && (
        <TouchableOpacity
          style={styles.reportBtn}
          onPress={() => setModalOpen(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="flag-outline" size={16} color={colors.error} />
          <Text style={styles.reportBtnText}>{t('dispute.openCta')}</Text>
        </TouchableOpacity>
      )}

      {/* Modal */}
      <Modal
        visible={modalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setModalOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('dispute.modalTitle')}</Text>
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalIntro}>{t('dispute.modalIntro')}</Text>

            <Text style={styles.sectionLabel}>{t('dispute.reasonLabel')}</Text>
            <View style={styles.reasonsGrid}>
              {REASONS.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.reasonChip,
                    reason === r && styles.reasonChipActive,
                  ]}
                  onPress={() => setReason(r)}
                  activeOpacity={0.85}
                >
                  <Text style={[
                    styles.reasonChipText,
                    reason === r && styles.reasonChipTextActive,
                  ]}>
                    {t(`dispute.reasons.${r}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>{t('dispute.descriptionLabel')}</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder={t('dispute.descriptionPlaceholder')}
              placeholderTextColor={colors.textLight}
              style={styles.textarea}
              multiline
              numberOfLines={5}
              maxLength={1000}
            />
            <Text style={styles.counter}>{description.length}/1000</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ height: 1 }} />
            </ScrollView>

            <TouchableOpacity
              style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
              onPress={submit}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.submitBtnText}>{t('dispute.submit')}</Text>
              }
            </TouchableOpacity>
            <Text style={styles.fineprint}>{t('dispute.fineprint')}</Text>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  statusCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'flex-start',
  },
  statusBody: { flex: 1, gap: 2 },
  statusTitle: { fontSize: fontSize.sm, fontWeight: '700' },
  statusReason: { fontSize: fontSize.xs, color: colors.textSecondary },
  statusResolution: {
    fontSize: fontSize.xs,
    color: colors.text,
    marginTop: 4,
    fontStyle: 'italic',
  },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reportBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.error,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  modalIntro: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.sm,
  },
  reasonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  reasonChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  reasonChipActive: {
    backgroundColor: colors.primary + '22',
    borderColor: colors.primary,
  },
  reasonChipText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  reasonChipTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  textarea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSize.sm,
    color: colors.text,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  counter: {
    fontSize: fontSize.xs,
    color: colors.textLight,
    textAlign: 'right',
  },
  submitBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  fineprint: {
    fontSize: fontSize.xs,
    color: colors.textLight,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
