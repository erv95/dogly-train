import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { subscribeAdminDisputes, adminResolveDispute } from '../../services/disputes';
import { showErrorAlert } from '../../utils/errors';
import { Dispute, DisputeStatus } from '../../types';
import { colors, spacing, fontSize, borderRadius } from '../../theme';
import { tsToDate } from '../../utils/firestore';

/**
 * Admin tab for moderating disputes. Three segments (open / resolved /
 * rejected). Reusable `subscribeAdminDisputes` keeps the list live as the
 * server marks new disputes — no manual refresh needed.
 *
 * Resolve flow: tap row → modal with textarea for resolution note → choose
 * "Resolve" or "Reject" → server marks status and notifies both parties.
 */

const SEGMENTS: DisputeStatus[] = ['open', 'resolved', 'rejected'];

export function AdminDisputesTab() {
  const { t } = useTranslation();
  const [segment, setSegment] = useState<DisputeStatus>('open');
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [selected, setSelected] = useState<Dispute | null>(null);
  const [resolution, setResolution] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const unsub = subscribeAdminDisputes(segment, setDisputes);
    return unsub;
  }, [segment]);

  const resolve = useCallback(async (status: 'resolved' | 'rejected') => {
    if (!selected) return;
    if (resolution.trim().length > 500) {
      Alert.alert(t('common.error'), t('admin.disputes.resolutionTooLong'));
      return;
    }
    setSubmitting(true);
    try {
      await adminResolveDispute(selected.id, status, resolution.trim());
      setSelected(null);
      setResolution('');
    } catch (err) {
      showErrorAlert(err);
    } finally {
      setSubmitting(false);
    }
  }, [selected, resolution, t]);

  return (
    <View style={styles.container}>
      {/* Segmented control */}
      <View style={styles.segments}>
        {SEGMENTS.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.segment, segment === s && styles.segmentActive]}
            onPress={() => setSegment(s)}
            activeOpacity={0.85}
          >
            <Text style={[styles.segmentText, segment === s && styles.segmentTextActive]}>
              {t(`dispute.statusYours.${s}`).replace(/^Tu /, '').replace(/^Your /, '')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={disputes}
        keyExtractor={(d) => d.id}
        ListEmptyComponent={
          <Text style={styles.emptyText}>{t('admin.disputes.empty')}</Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => segment === 'open' && setSelected(item)}
            activeOpacity={segment === 'open' ? 0.85 : 1}
          >
            <View style={styles.rowHeader}>
              <Ionicons name="flag" size={16} color={colors.warning} />
              <Text style={styles.rowReason}>{t(`dispute.reasons.${item.reason}`)}</Text>
              <Text style={styles.rowDate}>
                {tsToDate(item.createdAt)?.toLocaleDateString() ?? ''}
              </Text>
            </View>
            <Text style={styles.rowDescription} numberOfLines={3}>
              {item.description}
            </Text>
            <Text style={styles.rowMeta}>
              {t('admin.disputes.bookingLabel')}: {item.bookingId}
            </Text>
            <Text style={styles.rowMeta}>
              {t('admin.disputes.openedByLabel')}:{' '}
              {item.openedBy === item.ownerId ? 'owner' : 'provider'}
            </Text>
            {item.resolution ? (
              <View style={styles.resolutionBlock}>
                <Text style={styles.resolutionLabel}>
                  {t('admin.disputes.resolutionLabel')}
                </Text>
                <Text style={styles.resolutionText}>{item.resolution}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        )}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
      />

      {/* Resolve modal */}
      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('admin.disputes.resolveTitle')}</Text>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalIntro}>{t('admin.disputes.resolveIntro')}</Text>
            <TextInput
              value={resolution}
              onChangeText={setResolution}
              placeholder={t('admin.disputes.resolutionPlaceholder')}
              placeholderTextColor={colors.textLight}
              multiline
              numberOfLines={4}
              maxLength={500}
              style={styles.textarea}
            />
            <Text style={styles.counter}>{resolution.length}/500</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.btn, styles.btnReject, submitting && { opacity: 0.6 }]}
                onPress={() => resolve('rejected')}
                disabled={submitting}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnText}>{t('admin.disputes.reject')}</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnResolve, submitting && { opacity: 0.6 }]}
                onPress={() => resolve('resolved')}
                disabled={submitting}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnText}>{t('admin.disputes.resolve')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  segments: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
  },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600' },
  segmentTextActive: { color: '#fff' },
  emptyText: {
    textAlign: 'center',
    padding: spacing.xl,
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  row: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  rowReason: { flex: 1, fontWeight: '700', color: colors.text, fontSize: fontSize.sm },
  rowDate: { color: colors.textLight, fontSize: fontSize.xs },
  rowDescription: { color: colors.text, fontSize: fontSize.sm, lineHeight: 19 },
  rowMeta: { color: colors.textLight, fontSize: fontSize.xs, fontFamily: 'monospace' },
  resolutionBlock: {
    backgroundColor: colors.backgroundSecondary,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    marginTop: spacing.xs,
  },
  resolutionLabel: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '700' },
  resolutionText: { fontSize: fontSize.sm, color: colors.text, marginTop: 2 },
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
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  modalIntro: { fontSize: fontSize.sm, color: colors.textSecondary },
  textarea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    minHeight: 90,
    fontSize: fontSize.sm,
    color: colors.text,
    textAlignVertical: 'top',
  },
  counter: { fontSize: fontSize.xs, color: colors.textLight, textAlign: 'right' },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  btn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  btnReject: { backgroundColor: colors.textSecondary },
  btnResolve: { backgroundColor: colors.success },
  btnText: { color: '#fff', fontWeight: '700' },
});
