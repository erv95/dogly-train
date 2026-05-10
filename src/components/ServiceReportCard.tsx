import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Modal,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { ServiceReport, ServiceReportCategory } from '../types';
import { colors, spacing, fontSize, borderRadius, shadow } from '../theme';

const CATEGORY_TINTS: Record<ServiceReportCategory, string> = {
  walk: '#16A34A',
  day_care: '#F59E0B',
  overnight: '#6366F1',
  home_care: '#0EA5E9',
};

const CATEGORY_ICONS: Record<ServiceReportCategory, keyof typeof Ionicons.glyphMap> = {
  walk: 'walk',
  day_care: 'sunny',
  overnight: 'moon',
  home_care: 'home',
};

const WEATHER_EMOJIS: Record<string, string> = {
  sunny: '☀️', cloudy: '☁️', rainy: '🌧️', snowy: '❄️', cold: '🥶', hot: '🥵',
};

interface Props {
  report: ServiceReport;
  /** ISO timestamp string for the message */
  timeLabel?: string;
  /** True when the message is from the current user (caretaker viewing their
   *  own report). Affects bubble alignment / colour. */
  isOwn?: boolean;
}

export default function ServiceReportCard({ report, timeLabel, isOwn = false }: Props) {
  const { t } = useTranslation();
  const tint = CATEGORY_TINTS[report.category];
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);

  const photoCount = report.photoURLs.length;

  return (
    <View style={[styles.card, { borderColor: tint + '50' }, isOwn && styles.cardOwn]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: tint + '12' }]}>
        <View style={[styles.headerIcon, { backgroundColor: tint }]}>
          <Ionicons name={CATEGORY_ICONS[report.category]} size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>{t('serviceReports.title')}</Text>
          <Text style={[styles.headerCategory, { color: tint }]}>
            {t(`serviceReports.categories.${report.category}`)}
          </Text>
        </View>
        {timeLabel ? <Text style={styles.headerTime}>{timeLabel}</Text> : null}
      </View>

      {/* Photos */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
        {report.photoURLs.map((uri, i) => (
          <TouchableOpacity
            key={uri + i}
            onPress={() => setLightboxUri(uri)}
            activeOpacity={0.85}
            accessibilityRole="imagebutton"
            accessibilityLabel={`${t('serviceReports.photoOf', { current: i + 1, total: photoCount })}`}
          >
            <Image source={{ uri }} style={[styles.photo, photoCount === 1 && styles.photoSolo]} />
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Meta row (duration / energy / weather) */}
      <View style={styles.metaRow}>
        {report.durationMinutes !== undefined && (
          <View style={styles.metaPill}>
            <Ionicons name="time-outline" size={12} color={tint} />
            <Text style={[styles.metaText, { color: tint }]}>
              {report.durationMinutes} min
            </Text>
          </View>
        )}
        {report.energy && (
          <View style={styles.metaPill}>
            <Ionicons name="flash" size={12} color={tint} />
            <Text style={[styles.metaText, { color: tint }]}>
              {t(`walks.energy.${report.energy}`)}
            </Text>
          </View>
        )}
        {report.weather && (
          <View style={styles.metaPill}>
            <Text style={{ fontSize: 12 }}>{WEATHER_EMOJIS[report.weather]}</Text>
            <Text style={[styles.metaText, { color: tint }]}>
              {t(`walks.weather.${report.weather}`)}
            </Text>
          </View>
        )}
      </View>

      {/* Note */}
      {report.note ? (
        <View style={styles.noteBox}>
          <Text style={styles.noteText}>"{report.note}"</Text>
        </View>
      ) : null}

      {/* Lightbox */}
      <Modal visible={!!lightboxUri} transparent animationType="fade" onRequestClose={() => setLightboxUri(null)}>
        <TouchableOpacity
          style={styles.lightboxOverlay}
          activeOpacity={1}
          onPress={() => setLightboxUri(null)}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          {lightboxUri && (
            <Image
              source={{ uri: lightboxUri }}
              style={styles.lightboxImage}
              resizeMode="contain"
            />
          )}
          <View style={styles.lightboxCloseHint}>
            <Ionicons name="close" size={20} color="#fff" />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    backgroundColor: colors.background,
    overflow: 'hidden',
    maxWidth: 280,
    minWidth: 240,
    ...shadow.sm,
  },
  cardOwn: { alignSelf: 'flex-end' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerIcon: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  headerLabel: {
    fontSize: 10, fontWeight: '800', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  headerCategory: { fontSize: fontSize.sm, fontWeight: '800' },
  headerTime: { fontSize: 10, color: colors.textLight, fontWeight: '600' },

  photoRow: { gap: 4, padding: 4 },
  photo: { width: 110, height: 110, borderRadius: borderRadius.sm },
  photoSolo: { width: 268, height: 200 },

  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  metaPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: borderRadius.full,
    backgroundColor: colors.backgroundSecondary,
  },
  metaText: { fontSize: 11, fontWeight: '700' },

  noteBox: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    paddingBottom: spacing.md,
  },
  noteText: { fontSize: fontSize.sm, color: colors.text, fontStyle: 'italic', lineHeight: 20 },

  lightboxOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center', justifyContent: 'center',
  },
  lightboxImage: { width: SCREEN_W, height: SCREEN_H * 0.85 },
  lightboxCloseHint: {
    position: 'absolute', top: 40, right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)', padding: spacing.sm, borderRadius: 20,
  },
});
