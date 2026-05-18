import React from 'react';
import { Text, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, fontSize, borderRadius, TABULAR_NUMS } from '../theme';

interface Props {
  /** When true, tap navigates to /(shared)/transactions. Default true. */
  navigable?: boolean;
  style?: ViewStyle;
}

/**
 * Small always-visible chip showing the user's coin balance. Tap navigates to
 * the transaction history. Read-only — never modifies state. Hides itself
 * gracefully when there's no userData yet (e.g. cold start, anonymous).
 */
export function CoinBalancePill({ navigable = true, style }: Props) {
  const { userData } = useAuth();
  const router = useRouter();

  if (!userData) return null;
  const balance = userData.coinBalance ?? 0;

  const Inner = (
    <View style={[styles.pill, style]}>
      <Ionicons name="logo-bitcoin" size={14} color={colors.boost} />
      <Text style={styles.text}>{balance}</Text>
    </View>
  );

  if (!navigable) return Inner;

  return (
    <TouchableOpacity
      onPress={() => router.push('/(shared)/transactions')}
      activeOpacity={0.7}
      hitSlop={8}
    >
      {Inner}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.boost + '15',
    borderWidth: 1,
    borderColor: colors.boost + '40',
  },
  text: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.text,
    fontVariant: TABULAR_NUMS,
  },
});
