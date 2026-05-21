import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Dog } from '../types';
import { getLevelInfo, xpForNextLevel, LEVELS } from '../services/dogStats';
import { useDogStats } from '../contexts/DogStatsContext';
import { formatAgeShort } from '../utils/dogAge';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../theme';

/**
 * Hero card for the Hoy tab (Iter 8.7.1).
 *
 * Replaces the dry "Hola, X" greeting with an emotional, info-dense card:
 * dog photo, age in months/years, current level, XP progress mini-bar.
 *
 * The hero sits ABOVE DailyTipsRail; the rail still owns daily
 * recommendations + greeting. Splitting concerns keeps each component
 * under 150 LOC and makes the hero re-usable elsewhere (e.g. a future
 * "share progress" image).
 */
interface Props {
  dog: Dog;
}

export default function TodayHero({ dog }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  // Stats come from the shared DogStatsContext (provider in app/(owner)/today.tsx).
  // Replaces an independent getDogStats fetch — HIGH-8 of Iter 8.7.6.
  const { stats } = useDogStats();

  const level = stats ? getLevelInfo(stats.level) : LEVELS[0];
  const nextXp = stats ? xpForNextLevel(stats.level) : level.maxXp + 1;
  const isMax = nextXp === Infinity;
  const pct = isMax
    ? 1
    : Math.min(1, Math.max(0, ((stats?.xp ?? 0) - level.minXp) / (nextXp - level.minXp)));
  const xpToNext = isMax ? 0 : nextXp - (stats?.xp ?? 0);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/(shared)/dog-form?dogId=${dog.id}`)}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={`${dog.name}, ${t('progress.level')} ${level.level}, ${stats?.xp ?? 0} XP`}
    >
      <View style={styles.row}>
        <View style={styles.photoWrap}>
          {dog.photoURL ? (
            <Image source={{ uri: dog.photoURL }} style={styles.photo} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Ionicons name="paw" size={32} color={colors.primary} />
            </View>
          )}
        </View>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{dog.name}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {formatAgeShort(dog, t)}
            {dog.breed ? ` · ${dog.breed}` : ''}
          </Text>
          <View style={styles.levelRow}>
            <Text style={styles.levelEmoji}>{level.emoji}</Text>
            <Text style={styles.levelText}>
              {t('progress.level')} {level.level}
            </Text>
            {stats && (
              <Text style={styles.xpInline}>⚡ {stats.xp}</Text>
            )}
          </View>
        </View>
      </View>

      {/* Mini XP bar — hidden at max level (already maxed out). */}
      {!isMax && (
        <View style={styles.barWrap}>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                { width: `${pct * 100}%`, backgroundColor: colors.primary },
              ]}
            />
          </View>
          <Text style={styles.barCaption}>
            {xpToNext > 0
              ? t('progress.nextLevelXp', { xp: xpToNext })
              : t('progress.maxLevel')}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    // Border + subtle tint instead of shadow because MIUI/Xiaomi renders
    // shadow.sm as a hard grey rectangle ignoring borderRadius.
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  photoWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: fontSize.xl,
    fontFamily: fontFamily.bold,
    color: colors.text,
    letterSpacing: -0.3,
  },
  meta: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  levelEmoji: { fontSize: 16 },
  levelText: {
    fontSize: fontSize.xs,
    fontFamily: fontFamily.semibold,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  xpInline: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontFamily: fontFamily.semibold,
  },
  barWrap: {
    marginTop: spacing.md,
    gap: 4,
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.borderLight,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  barCaption: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'right',
  },
});
