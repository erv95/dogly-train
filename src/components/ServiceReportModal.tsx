import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { sendServiceReport } from '../services/serviceReports';
import { ServiceReportCategory, WalkEnergy, WalkWeather } from '../types';
import { colors, spacing, fontSize, borderRadius, shadow } from '../theme';

const CATEGORIES: ServiceReportCategory[] = ['walk', 'day_care', 'overnight', 'home_care'];
const ENERGIES: WalkEnergy[] = ['low', 'medium', 'high'];
const WEATHERS: WalkWeather[] = ['sunny', 'cloudy', 'rainy', 'snowy', 'cold', 'hot'];

const CATEGORY_ICONS: Record<ServiceReportCategory, keyof typeof Ionicons.glyphMap> = {
  walk: 'walk',
  day_care: 'sunny',
  overnight: 'moon',
  home_care: 'home',
};

const WEATHER_EMOJIS: Record<WalkWeather, string> = {
  sunny: '☀️', cloudy: '☁️', rainy: '🌧️', snowy: '❄️', cold: '🥶', hot: '🥵',
};

const QUICK_DURATIONS = [15, 30, 45, 60, 90, 120];
const MAX_PHOTOS = 3;

interface Props {
  visible: boolean;
  chatId: string;
  senderId: string;
  recipientId?: string;
  onClose: () => void;
  onSent: () => void;
}

export default function ServiceReportModal({
  visible, chatId, senderId, recipientId, onClose, onSent,
}: Props) {
  const { t } = useTranslation();

  const [category, setCategory] = useState<ServiceReportCategory>('walk');
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [note, setNote] = useState<string>('');
  const [duration, setDuration] = useState<number | null>(30);
  const [energy, setEnergy] = useState<WalkEnergy | null>(null);
  const [weather, setWeather] = useState<WalkWeather | null>(null);
  const [sending, setSending] = useState<boolean>(false);

  const valid = photoUris.length >= 1 && note.trim().length > 0 && !sending;

  const handlePickPhotos = async () => {
    const remaining = MAX_PHOTOS - photoUris.length;
    if (remaining <= 0) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 0.85,
      });
      if (result.canceled) return;
      const uris = result.assets.map((a) => a.uri).slice(0, remaining);
      setPhotoUris((prev) => [...prev, ...uris].slice(0, MAX_PHOTOS));
    } catch (err) {
      console.error('Pick photos error', err);
      Alert.alert(t('common.error'), t('authErrors.generic'));
    }
  };

  const removePhoto = (idx: number) => {
    setPhotoUris((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSend = async () => {
    if (!valid) return;
    setSending(true);
    try {
      await sendServiceReport({
        chatId,
        senderId,
        recipientId,
        category,
        photoUris,
        note: note.trim(),
        durationMinutes: duration ?? undefined,
        energy: energy ?? undefined,
        weather: weather ?? undefined,
      });
      onSent();
    } catch (err) {
      console.error('Send service report error', err);
      Alert.alert(t('common.error'), t('serviceReports.sendError'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} disabled={sending}>
              <Text style={[styles.cancel, sending && { opacity: 0.4 }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <Text style={styles.title}>{t('serviceReports.modalTitle')}</Text>
            <TouchableOpacity onPress={handleSend} disabled={!valid}>
              {sending ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <Text style={[styles.send, !valid && styles.sendDisabled]}>
                  {t('serviceReports.send')}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {/* Category */}
            <Text style={styles.fieldLabel}>{t('serviceReports.categoryLabel')}</Text>
            <View style={styles.chipRow}>
              {CATEGORIES.map((c) => {
                const active = category === c;
                return (
                  <TouchableOpacity
                    key={c}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setCategory(c)}
                  >
                    <Ionicons
                      name={CATEGORY_ICONS[c]}
                      size={14}
                      color={active ? '#fff' : colors.textSecondary}
                    />
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {t(`serviceReports.categories.${c}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Photos */}
            <Text style={styles.fieldLabel}>
              {t('serviceReports.photosLabel', { current: photoUris.length, max: MAX_PHOTOS })}
            </Text>
            <View style={styles.photoGrid}>
              {photoUris.map((uri, i) => (
                <View key={uri + i} style={styles.photoCell}>
                  <Image source={{ uri }} style={styles.photoImage} />
                  <TouchableOpacity
                    style={styles.photoRemove}
                    onPress={() => removePhoto(i)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('serviceReports.removePhoto')}
                  >
                    <Ionicons name="close-circle" size={22} color={colors.error} />
                  </TouchableOpacity>
                </View>
              ))}
              {photoUris.length < MAX_PHOTOS && (
                <TouchableOpacity
                  style={[styles.photoCell, styles.photoAddCell]}
                  onPress={handlePickPhotos}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t('serviceReports.addPhotos')}
                >
                  <Ionicons name="camera" size={26} color={colors.primary} />
                  <Text style={styles.photoAddLabel}>{t('serviceReports.addPhoto')}</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Duration chips */}
            <Text style={styles.fieldLabel}>{t('serviceReports.durationLabel')}</Text>
            <View style={styles.chipRow}>
              {QUICK_DURATIONS.map((d) => {
                const active = duration === d;
                return (
                  <TouchableOpacity
                    key={d}
                    style={[styles.miniChip, active && styles.miniChipActive]}
                    onPress={() => setDuration(active ? null : d)}
                  >
                    <Text style={[styles.miniChipText, active && styles.miniChipTextActive]}>
                      {d} min
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Energy */}
            <Text style={styles.fieldLabel}>{t('serviceReports.energyLabel')}</Text>
            <View style={styles.chipRow}>
              {ENERGIES.map((e) => {
                const active = energy === e;
                return (
                  <TouchableOpacity
                    key={e}
                    style={[styles.miniChip, active && styles.miniChipActive]}
                    onPress={() => setEnergy(active ? null : e)}
                  >
                    <Text style={[styles.miniChipText, active && styles.miniChipTextActive]}>
                      {t(`walks.energy.${e}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Weather */}
            <Text style={styles.fieldLabel}>{t('serviceReports.weatherLabel')}</Text>
            <View style={styles.chipRow}>
              {WEATHERS.map((w) => {
                const active = weather === w;
                return (
                  <TouchableOpacity
                    key={w}
                    style={[styles.miniChip, active && styles.miniChipActive]}
                    onPress={() => setWeather(active ? null : w)}
                  >
                    <Text style={[styles.miniChipText, active && styles.miniChipTextActive]}>
                      {WEATHER_EMOJIS[w]} {t(`walks.weather.${w}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Note */}
            <Text style={styles.fieldLabel}>
              {t('serviceReports.noteLabel')} ({note.length}/280)
            </Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={note}
              onChangeText={setNote}
              placeholder={t('serviceReports.notePlaceholder')}
              placeholderTextColor={colors.textLight}
              multiline
              numberOfLines={3}
              maxLength={280}
            />

            <Text style={styles.help}>{t('serviceReports.help')}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingBottom: spacing.lg,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: 'center', marginTop: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  title: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  cancel: { fontSize: fontSize.md, color: colors.textSecondary, fontWeight: '600' },
  send: { fontSize: fontSize.md, color: colors.primary, fontWeight: '800' },
  sendDisabled: { color: colors.textLight },

  body: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  fieldLabel: {
    fontSize: fontSize.sm, fontWeight: '700', color: colors.text,
    marginTop: spacing.md, marginBottom: spacing.xs,
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: borderRadius.full, borderWidth: 1.5,
    borderColor: colors.border, backgroundColor: colors.background,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textSecondary },
  chipTextActive: { color: '#fff' },

  miniChip: {
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: borderRadius.full, borderWidth: 1,
    borderColor: colors.border, backgroundColor: colors.background,
  },
  miniChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  miniChipText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textSecondary },
  miniChipTextActive: { color: '#fff' },

  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoCell: {
    width: 88, height: 88, borderRadius: borderRadius.md, overflow: 'hidden',
    position: 'relative', backgroundColor: colors.backgroundSecondary,
  },
  photoImage: { width: '100%', height: '100%' },
  photoRemove: {
    position: 'absolute', top: 2, right: 2,
    backgroundColor: '#fff', borderRadius: 12,
  },
  photoAddCell: {
    alignItems: 'center', justifyContent: 'center', gap: 4,
    borderWidth: 1.5, borderColor: colors.primary + '60', borderStyle: 'dashed',
  },
  photoAddLabel: { fontSize: 10, fontWeight: '700', color: colors.primary },

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
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },

  help: {
    fontSize: fontSize.xs, color: colors.textLight,
    marginTop: spacing.md, fontStyle: 'italic', textAlign: 'center',
  },
});
