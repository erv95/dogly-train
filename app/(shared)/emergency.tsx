import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Modal,
  TextInput,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useNavigation } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import {
  createEmergencyContact,
  deleteEmergencyContact,
  getEmergencyContacts,
  setPrimaryContact,
  updateEmergencyContact,
} from '../../src/services/emergencyContacts';
import { EmergencyContact, EmergencyRelationship, ProtocolId } from '../../src/types';
import { useAuth } from '../../src/contexts/AuthContext';
import EmptyHint from '../../src/components/EmptyHint';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../src/theme';

const PROTOCOLS: { id: ProtocolId; emoji: string; tint: string }[] = [
  { id: 'choking',     emoji: '😮‍💨', tint: '#EF4444' },
  { id: 'bleeding',    emoji: '🩸',   tint: '#DC2626' },
  { id: 'poisoning',   emoji: '☠️',   tint: '#7C3AED' },
  { id: 'heat_stroke', emoji: '🥵',   tint: '#F97316' },
  { id: 'seizures',    emoji: '⚡',    tint: '#F59E0B' },
  { id: 'cpr',         emoji: '🫀',   tint: '#E11D48' },
];

const RELATIONSHIPS: EmergencyRelationship[] = ['vet', 'backup', 'shelter', 'other'];
const RELATIONSHIP_ICONS: Record<EmergencyRelationship, keyof typeof Ionicons.glyphMap> = {
  vet: 'medkit',
  backup: 'people',
  shelter: 'home',
  other: 'call',
};

export default function EmergencyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const { firebaseUser } = useAuth();

  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<EmergencyContact | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: t('emergency.title') });
  }, [navigation, t]);

  const load = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const result = await getEmergencyContacts(firebaseUser.uid);
      setContacts(result);
    } catch (err) {
      console.error('Error loading emergency contacts', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [firebaseUser]);

  useEffect(() => { load(); }, [load]);

  const primary = contacts.find((c) => c.isPrimary) ?? null;

  const placeCall = async (rawPhone: string) => {
    const phone = rawPhone.replace(/[^\d+]/g, '');
    const url = `tel:${phone}`;
    // Skip canOpenURL: in Expo Go (Android) it returns false even when the
    // system dialer is fully available. openURL will throw if it really can't
    // open, and we surface that as the user-facing error.
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(t('common.error'), t('emergency.callNotAvailable'));
    }
  };

  const findNearbyVet = async () => {
    // Try device coords; fall back to a generic search if no permission
    let lat: number | null = null;
    let lon: number | null = null;
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        lat = loc.coords.latitude;
        lon = loc.coords.longitude;
      }
    } catch { /* fall through */ }

    // Universal Google Maps search URL works on iOS & Android browsers/apps
    const q = encodeURIComponent(t('emergency.vetSearchTerm'));
    const url = lat != null && lon != null
      ? `https://www.google.com/maps/search/?api=1&query=${q}&query_place_id=&center=${lat},${lon}`
      : `https://www.google.com/maps/search/?api=1&query=${q}`;
    Linking.openURL(url).catch(() => {
      Alert.alert(t('common.error'), t('authErrors.generic'));
    });
  };

  const handleSetPrimary = async (c: EmergencyContact) => {
    if (!firebaseUser || c.isPrimary) return;
    try {
      await setPrimaryContact(firebaseUser.uid, c.id);
      load();
    } catch {
      Alert.alert(t('common.error'), t('authErrors.generic'));
    }
  };

  const handleDelete = (c: EmergencyContact) => {
    Alert.alert(
      t('emergency.contacts.deleteConfirm'),
      c.name,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteEmergencyContact(c.id);
              load();
            } catch {
              Alert.alert(t('common.error'), t('authErrors.generic'));
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[colors.error]} />
        }
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="warning" size={36} color="#fff" />
          </View>
          <Text style={styles.heroTitle}>{t('emergency.title')}</Text>
          <Text style={styles.heroSubtitle}>{t('emergency.subtitle')}</Text>
        </View>

        {/* Quick action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnPrimary, !primary && styles.actionBtnDisabled]}
            onPress={() => primary && placeCall(primary.phone)}
            disabled={!primary}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('emergency.callPrimary')}
          >
            <Ionicons name="call" size={22} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={styles.actionBtnText} numberOfLines={1}>
                {t('emergency.callPrimary')}
              </Text>
              <Text style={styles.actionBtnSubtext} numberOfLines={1}>
                {primary ? primary.name : t('emergency.noPrimaryHint')}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnSecondary]}
            onPress={findNearbyVet}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('emergency.callVet')}
          >
            <Ionicons name="location" size={22} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={styles.actionBtnText} numberOfLines={1}>
                {t('emergency.callVet')}
              </Text>
              <Text style={styles.actionBtnSubtext} numberOfLines={1}>
                {t('emergency.openMaps')}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Universal phones */}
        <View style={styles.phonesBox}>
          <UniversalPhone
            label={t('emergency.universalPhones.toxicLabel')}
            phone={t('emergency.universalPhones.toxic')}
            onPress={(p) => placeCall(p)}
          />
          <UniversalPhone
            label={t('emergency.universalPhones.emergencyLabel')}
            phone={t('emergency.universalPhones.emergency')}
            onPress={(p) => placeCall(p)}
          />
        </View>

        {/* Contacts */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('emergency.contacts.title')}</Text>
          <TouchableOpacity
            onPress={() => { setEditing(null); setFormVisible(true); }}
            style={styles.addBtn}
            accessibilityRole="button"
            accessibilityLabel={t('emergency.contacts.add')}
          >
            <Ionicons name="add-circle" size={26} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.error} style={{ marginVertical: spacing.lg }} />
        ) : contacts.length === 0 ? (
          <EmptyHint
            icon="medkit-outline"
            variant="puppy"
            size="sm"
            title={t('emergency.contacts.emptyTitle')}
            body={t('emergency.contacts.emptyBody')}
            ctaLabel={t('emergency.contacts.add')}
            onCta={() => { setEditing(null); setFormVisible(true); }}
          />
        ) : (
          contacts.map((c) => (
            <ContactRow
              key={c.id}
              contact={c}
              onCall={() => placeCall(c.phone)}
              onSetPrimary={() => handleSetPrimary(c)}
              onEdit={() => { setEditing(c); setFormVisible(true); }}
              onDelete={() => handleDelete(c)}
              labelFor={(r) => t(`emergency.relationship.${r}`)}
            />
          ))
        )}

        {/* Protocols */}
        <Text style={[styles.sectionTitle, { marginTop: spacing.xl, paddingHorizontal: spacing.md }]}>
          {t('emergency.protocols.sectionTitle')}
        </Text>
        <View style={styles.protocolsGrid}>
          {PROTOCOLS.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.protocolCard, { borderColor: p.tint + '60' }]}
              onPress={() => router.push(`/(shared)/emergency-protocol/${p.id}`)}
              activeOpacity={0.85}
            >
              <View style={[styles.protocolIcon, { backgroundColor: p.tint + '22' }]}>
                <Text style={styles.protocolEmoji}>{p.emoji}</Text>
              </View>
              <Text style={styles.protocolTitle} numberOfLines={2}>
                {t(`emergency.protocols.${p.id}.title`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Disclaimer */}
        <View style={styles.disclaimerBox}>
          <Ionicons name="information-circle" size={18} color={colors.warning} />
          <Text style={styles.disclaimerText}>{t('emergency.disclaimer')}</Text>
        </View>
      </ScrollView>

      {/* Contact form modal */}
      {formVisible && firebaseUser && (
        <ContactFormModal
          visible={formVisible}
          existing={editing}
          userId={firebaseUser.uid}
          onClose={() => { setFormVisible(false); setEditing(null); }}
          onSaved={() => { setFormVisible(false); setEditing(null); load(); }}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Universal phone row ─────────────────────────────────────────────────────

function UniversalPhone({ label, phone, onPress }: { label: string; phone: string; onPress: (p: string) => void }) {
  return (
    <TouchableOpacity style={styles.phoneRow} onPress={() => onPress(phone)} activeOpacity={0.7}>
      <View style={styles.phoneRowLeft}>
        <Text style={styles.phoneLabel}>{label}</Text>
        <Text style={styles.phoneValue}>{phone}</Text>
      </View>
      <Ionicons name="call" size={18} color={colors.error} />
    </TouchableOpacity>
  );
}

// ─── Contact row ─────────────────────────────────────────────────────────────

function ContactRow({
  contact,
  onCall,
  onSetPrimary,
  onEdit,
  onDelete,
  labelFor,
}: {
  contact: EmergencyContact;
  onCall: () => void;
  onSetPrimary: () => void;
  onEdit: () => void;
  onDelete: () => void;
  labelFor: (r: EmergencyRelationship) => string;
}) {
  const { t } = useTranslation();
  return (
    <View style={[styles.contactRow, contact.isPrimary && styles.contactRowPrimary]}>
      <View style={[styles.contactIcon, contact.isPrimary && { backgroundColor: colors.error + '20' }]}>
        <Ionicons
          name={RELATIONSHIP_ICONS[contact.relationship]}
          size={20}
          color={contact.isPrimary ? colors.error : colors.textSecondary}
        />
      </View>
      <View style={styles.contactBody}>
        <View style={styles.contactTopRow}>
          <Text style={styles.contactName} numberOfLines={1}>{contact.name}</Text>
          {contact.isPrimary && (
            <View style={styles.primaryBadge}>
              <Ionicons name="star" size={10} color="#fff" />
              <Text style={styles.primaryBadgeText}>{t('emergency.contacts.primary')}</Text>
            </View>
          )}
        </View>
        <Text style={styles.contactPhone}>{contact.phone}</Text>
        <Text style={styles.contactRel} numberOfLines={1}>
          {labelFor(contact.relationship)}
          {contact.notes ? ` · ${contact.notes}` : ''}
        </Text>
      </View>
      <View style={styles.contactActions}>
        <TouchableOpacity onPress={onCall} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('emergency.contacts.call')}>
          <Ionicons name="call" size={22} color={colors.success} />
        </TouchableOpacity>
        {!contact.isPrimary && (
          <TouchableOpacity onPress={onSetPrimary} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('emergency.contacts.makePrimary')}>
            <Ionicons name="star-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={onEdit} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.edit')}>
          <Ionicons name="create-outline" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.delete')}>
          <Ionicons name="trash-outline" size={20} color={colors.error} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Contact form modal ─────────────────────────────────────────────────────

function ContactFormModal({
  visible,
  existing,
  userId,
  onClose,
  onSaved,
}: {
  visible: boolean;
  existing: EmergencyContact | null;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const isEdit = existing !== null;

  const [name, setName] = useState(existing?.name ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [relationship, setRelationship] = useState<EmergencyRelationship>(existing?.relationship ?? 'vet');
  const [isPrimary, setIsPrimary] = useState<boolean>(existing?.isPrimary ?? false);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [saving, setSaving] = useState(false);

  const valid = name.trim().length > 0 && phone.trim().length > 0;

  const handleSave = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      if (isEdit && existing) {
        // Update fields, then handle isPrimary toggle separately so the
        // single-primary invariant stays correct.
        await updateEmergencyContact(existing.id, { name, phone, relationship, notes });
        if (isPrimary && !existing.isPrimary) {
          const { setPrimaryContact } = await import('../../src/services/emergencyContacts');
          await setPrimaryContact(userId, existing.id);
        } else if (!isPrimary && existing.isPrimary) {
          await updateEmergencyContact(existing.id, { isPrimary: false });
        }
      } else {
        await createEmergencyContact({ userId, name, phone, relationship, isPrimary, notes });
      }
      onSaved();
    } catch {
      Alert.alert(t('common.error'), t('authErrors.generic'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {isEdit ? t('emergency.contacts.edit') : t('emergency.contacts.new')}
            </Text>
            <TouchableOpacity onPress={handleSave} disabled={!valid || saving}>
              {saving ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <Text style={[styles.saveText, !valid && styles.saveTextDisabled]}>
                  {t('common.save')}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.formBody} showsVerticalScrollIndicator={false}>
            <Text style={styles.fieldLabel}>{t('emergency.contacts.nameLabel')}</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={t('emergency.contacts.namePlaceholder')}
              placeholderTextColor={colors.textLight}
              maxLength={80}
            />

            <Text style={styles.fieldLabel}>{t('emergency.contacts.phoneLabel')}</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="+34 600 000 000"
              placeholderTextColor={colors.textLight}
              keyboardType="phone-pad"
              maxLength={30}
            />

            <Text style={styles.fieldLabel}>{t('emergency.contacts.relationshipLabel')}</Text>
            <View style={styles.chipRow}>
              {RELATIONSHIPS.map((r) => {
                const active = relationship === r;
                return (
                  <TouchableOpacity
                    key={r}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setRelationship(r)}
                  >
                    <Ionicons name={RELATIONSHIP_ICONS[r]} size={14} color={active ? '#fff' : colors.textSecondary} />
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {t(`emergency.relationship.${r}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>{t('emergency.contacts.notesLabel')}</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={notes}
              onChangeText={setNotes}
              placeholder={t('emergency.contacts.notesPlaceholder')}
              placeholderTextColor={colors.textLight}
              multiline
              numberOfLines={2}
              maxLength={200}
            />

            <TouchableOpacity
              style={styles.primaryToggle}
              onPress={() => setIsPrimary((v) => !v)}
              activeOpacity={0.7}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isPrimary }}
            >
              <Ionicons
                name={isPrimary ? 'checkbox' : 'square-outline'}
                size={22}
                color={isPrimary ? colors.error : colors.textSecondary}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.primaryToggleText}>{t('emergency.contacts.markPrimary')}</Text>
                <Text style={styles.primaryToggleHint}>{t('emergency.contacts.markPrimaryHint')}</Text>
              </View>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  scroll: { paddingBottom: spacing.xxl },

  // Hero
  hero: {
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: colors.error + '12',
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.error + '30',
  },
  heroIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: colors.error,
    alignItems: 'center', justifyContent: 'center',
    ...shadow.md,
  },
  heroTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '900',
    color: colors.error,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: fontSize.sm,
    color: colors.text,
    textAlign: 'center',
    fontWeight: '600',
  },

  // Action buttons
  actionRow: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    ...shadow.sm,
  },
  actionBtnPrimary: { backgroundColor: colors.error },
  actionBtnSecondary: { backgroundColor: '#0EA5E9' },
  actionBtnDisabled: { opacity: 0.5 },
  actionBtnText: { fontSize: fontSize.md, fontWeight: '800', color: '#fff' },
  actionBtnSubtext: { fontSize: fontSize.xs, color: '#FFFFFFCC', fontWeight: '600' },

  // Universal phones
  phonesBox: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.lg,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  phoneRowLeft: { flex: 1, gap: 2 },
  phoneLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  phoneValue: { fontSize: fontSize.sm, color: colors.text, fontWeight: '700' },

  // Section
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionTitle: { flex: 1, fontSize: fontSize.md, fontWeight: '800', color: colors.text },
  addBtn: { padding: 2 },

  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  contactRowPrimary: { borderColor: colors.error + '60', borderWidth: 1.5 },
  contactIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center', justifyContent: 'center',
  },
  contactBody: { flex: 1, gap: 2 },
  contactTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  contactName: { fontSize: fontSize.md, fontWeight: '800', color: colors.text, flexShrink: 1 },
  primaryBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.error,
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  primaryBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  contactPhone: { fontSize: fontSize.sm, color: colors.text, fontWeight: '700' },
  contactRel: { fontSize: fontSize.xs, color: colors.textSecondary },
  contactActions: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },

  // Protocols
  protocolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  protocolCard: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 120,
    justifyContent: 'center',
    ...shadow.sm,
  },
  protocolIcon: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
  },
  protocolEmoji: { fontSize: 28 },
  protocolTitle: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },

  // Disclaimer
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    margin: spacing.md,
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.warning + '12',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.warning + '40',
  },
  disclaimerText: {
    flex: 1,
    fontSize: 12,
    color: colors.text,
    lineHeight: 18,
    fontStyle: 'italic',
  },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: spacing.lg,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: 'center', marginTop: spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  modalTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  cancelText: { fontSize: fontSize.md, color: colors.textSecondary, fontWeight: '600' },
  saveText: { fontSize: fontSize.md, color: colors.primary, fontWeight: '700' },
  saveTextDisabled: { color: colors.textLight },

  formBody: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  fieldLabel: {
    fontSize: fontSize.sm, fontWeight: '700', color: colors.text,
    marginTop: spacing.md, marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    fontSize: fontSize.md,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputMultiline: { minHeight: 60, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipActive: { backgroundColor: colors.error, borderColor: colors.error },
  chipText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { color: '#fff', fontWeight: '700' },

  primaryToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.error + '08',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.error + '30',
    marginTop: spacing.md,
  },
  primaryToggleText: { fontSize: fontSize.sm, fontWeight: '800', color: colors.text },
  primaryToggleHint: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
});
