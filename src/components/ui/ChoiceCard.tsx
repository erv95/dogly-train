import React from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../../theme';

/**
 * Large tappable card for "pick one of N" choices (role selector, gender
 * selector, parent-type). Extracted in Iter 8.4 so we stop hand-rolling
 * the same emoji + title + description pattern in every new screen
 * (complete-profile.tsx already had 2 copies).
 *
 * Keep deliberately simple — no icon font (use emoji instead), no
 * left/right alignment variants, no internal state. The parent owns the
 * `selected` boolean and the `onPress` callback.
 */
interface Props {
  emoji: string;
  title: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}

export default function ChoiceCard({ emoji, title, description, selected, onPress, disabled }: Props) {
  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.cardSelected, disabled && styles.cardDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={[styles.title, selected && styles.titleSelected]}>{title}</Text>
      {description ? (
        <Text style={styles.description}>{description}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight + '20',
  },
  cardDisabled: {
    opacity: 0.4,
  },
  emoji: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: fontSize.lg,
    fontFamily: fontFamily.bold,
    color: colors.text,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  titleSelected: {
    color: colors.primary,
  },
  description: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
