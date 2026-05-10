import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { BookingService } from '../types';
import { colors, spacing, fontSize, borderRadius } from '../theme';

export interface BookingFilters {
  /** Selected dog names to keep. Empty = no filter. */
  dogNames: string[];
  /** Selected services to keep. Empty = no filter. */
  services: BookingService[];
}

export const EMPTY_FILTERS: BookingFilters = { dogNames: [], services: [] };

export function activeFilterCount(f: BookingFilters): number {
  return f.dogNames.length + f.services.length;
}

interface Props {
  visible: boolean;
  /** Available dog names extracted from the loaded bookings (deduped). */
  availableDogs: string[];
  /** Available services in the loaded bookings (deduped). */
  availableServices: BookingService[];
  /** Current filter selection. */
  value: BookingFilters;
  onClose: () => void;
  onApply: (next: BookingFilters) => void;
}

const SERVICE_LABEL_KEYS: Record<BookingService, string> = {
  training: 'bookings.service.training',
  walk: 'bookings.service.walk',
  day_care: 'bookings.service.day_care',
  overnight: 'bookings.service.overnight',
  home_care: 'bookings.service.home_care',
};

export function BookingFiltersModal({
  visible,
  availableDogs,
  availableServices,
  value,
  onClose,
  onApply,
}: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = React.useState<BookingFilters>(value);

  // Reset the draft to whatever the parent has every time we open. Avoids
  // showing stale toggles when the user closes without applying.
  React.useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  const toggleDog = (name: string) => {
    setDraft((d) => ({
      ...d,
      dogNames: d.dogNames.includes(name)
        ? d.dogNames.filter((n) => n !== name)
        : [...d.dogNames, name],
    }));
  };

  const toggleService = (s: BookingService) => {
    setDraft((d) => ({
      ...d,
      services: d.services.includes(s)
        ? d.services.filter((x) => x !== s)
        : [...d.services, s],
    }));
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>{t('bookings.filters.title')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {/* Dogs */}
            {availableDogs.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('bookings.filters.dogs')}</Text>
                <View style={styles.chipRow}>
                  {availableDogs.map((name) => {
                    const active = draft.dogNames.includes(name);
                    return (
                      <TouchableOpacity
                        key={name}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => toggleDog(name)}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                          {name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Service types */}
            {availableServices.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('bookings.filters.services')}</Text>
                <View style={styles.chipRow}>
                  {availableServices.map((s) => {
                    const active = draft.services.includes(s);
                    return (
                      <TouchableOpacity
                        key={s}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => toggleService(s)}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {t(SERVICE_LABEL_KEYS[s])}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {availableDogs.length === 0 && availableServices.length === 0 && (
              <Text style={styles.empty}>{t('bookings.filters.noOptions')}</Text>
            )}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnSecondary]}
              onPress={() => setDraft(EMPTY_FILTERS)}
            >
              <Text style={styles.btnSecondaryText}>{t('bookings.filters.reset')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary]}
              onPress={() => onApply(draft)}
            >
              <Text style={styles.btnPrimaryText}>{t('bookings.filters.apply')}</Text>
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
    maxHeight: '80%',
  },
  handle: {
    width: 36, height: 4, backgroundColor: colors.border, borderRadius: 2,
    alignSelf: 'center', marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  title: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text },
  body: { paddingVertical: spacing.md, gap: spacing.lg },
  section: { gap: spacing.sm },
  sectionTitle: {
    fontSize: fontSize.xs, fontWeight: '700', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '700' },
  chipTextActive: { color: colors.textOnPrimary },
  empty: {
    fontSize: fontSize.sm, color: colors.textSecondary,
    textAlign: 'center', paddingVertical: spacing.xl,
  },
  actions: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.md },
  btn: {
    flex: 1, paddingVertical: spacing.md, borderRadius: borderRadius.full,
    alignItems: 'center',
  },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { color: colors.textOnPrimary, fontWeight: '800' },
  btnSecondary: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  btnSecondaryText: { color: colors.text, fontWeight: '700' },
});
