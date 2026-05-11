import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, spacing, fontSize, borderRadius } from '../theme';

type Size = 'sm' | 'md' | 'lg';

interface Props {
  /** When true, render the badge. When false, render nothing (so callers can
   *  pass `<VerifiedBadge visible={user.verified} />` without conditionals). */
  visible?: boolean;
  size?: Size;
  /** When false, the badge shows just the icon (no "Verificado" label).
   *  Useful for compact card chips where space is tight. */
  showLabel?: boolean;
  style?: ViewStyle;
}

/**
 * "✓ Verificado" badge shown next to a provider's name when admin has
 * approved their ID document. Visible signal that builds trust before owners
 * decide to book — competing apps (Rover, Wag, Gudog) all show this prominently.
 */
export function VerifiedBadge({ visible = true, size = 'md', showLabel = true, style }: Props) {
  const { t } = useTranslation();
  if (!visible) return null;

  const dimensions = SIZE_MAP[size];

  return (
    <View
      style={[
        styles.badge,
        {
          paddingHorizontal: dimensions.padX,
          paddingVertical: dimensions.padY,
          gap: dimensions.gap,
        },
        style,
      ]}
      accessibilityLabel={t('verified.badgeLabel')}
    >
      <Ionicons name="shield-checkmark" size={dimensions.icon} color={colors.success} />
      {showLabel && (
        <Text style={[styles.label, { fontSize: dimensions.font }]}>
          {t('verified.short')}
        </Text>
      )}
    </View>
  );
}

const SIZE_MAP: Record<Size, { icon: number; font: number; padX: number; padY: number; gap: number }> = {
  sm: { icon: 12, font: 10, padX: 6, padY: 2, gap: 3 },
  md: { icon: 14, font: 12, padX: 8, padY: 3, gap: 4 },
  lg: { icon: 18, font: 14, padX: 10, padY: 5, gap: 5 },
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.success + '15',
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.success + '40',
    alignSelf: 'flex-start',
  },
  label: {
    color: colors.success,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
