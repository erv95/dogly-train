import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../theme';

/**
 * Reusable empty-state block (Iter 8.5).
 *
 * Before this component, 5+ owner-facing screens hand-rolled their own
 * "no data yet" UI with slight visual drift between them. Consolidating
 * into one component eliminates the drift, lets us roll a puppy-themed
 * variant globally, and makes future tutorial spotlighting (Iter 8.7
 * pulse-ring) target a single component class.
 *
 * Keep deliberately small — no internal data fetching, no animations
 * (the parent decides whether to wrap in PulseRing or similar).
 */
interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  ctaLabel?: string;
  onCta?: () => void;
  /** `puppy` swaps the icon circle tint to primary + a softer body color,
   *  signalling "this is part of the puppy-parent flow". */
  variant?: 'default' | 'puppy';
  /** `lg` (default) is the full hero used inside an empty list; `sm` is a
   *  smaller inline variant for inside a card. */
  size?: 'sm' | 'lg';
}

export default function EmptyHint({
  icon,
  title,
  body,
  ctaLabel,
  onCta,
  variant = 'default',
  size = 'lg',
}: Props) {
  const isSmall = size === 'sm';
  const isPuppy = variant === 'puppy';
  const iconSize = isSmall ? 28 : 40;
  const circleSize = isSmall ? 56 : 96;
  const tint = isPuppy ? colors.primary : colors.textSecondary;

  return (
    <View style={[styles.container, isSmall && styles.containerSm]}>
      <View
        style={[
          styles.iconCircle,
          { width: circleSize, height: circleSize, borderRadius: circleSize / 2 },
          { backgroundColor: tint + '18' },
        ]}
      >
        <Ionicons name={icon} size={iconSize} color={tint} />
      </View>
      <Text style={[styles.title, isSmall && styles.titleSm]}>{title}</Text>
      {body ? (
        <Text style={[styles.body, isSmall && styles.bodySm]}>{body}</Text>
      ) : null}
      {ctaLabel && onCta ? (
        <TouchableOpacity style={styles.cta} onPress={onCta} activeOpacity={0.85}>
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  containerSm: {
    paddingVertical: spacing.lg,
    gap: spacing.xs,
  },
  iconCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: fontSize.xl,
    fontFamily: fontFamily.bold,
    color: colors.text,
    textAlign: 'center',
  },
  titleSm: {
    fontSize: fontSize.md,
  },
  body: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  bodySm: {
    fontSize: fontSize.xs,
    lineHeight: 18,
  },
  cta: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
  },
  ctaText: {
    color: colors.textOnPrimary,
    fontFamily: fontFamily.bold,
    fontSize: fontSize.md,
  },
});
