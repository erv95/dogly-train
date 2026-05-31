import React from 'react';
import { Modal, View, Text, StyleSheet } from 'react-native';
import Button from './Button';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../../theme';

/** Mirrors the shape of React Native's `Alert.alert` button objects so call
 *  sites can migrate with a near-identical signature. */
export type AlertButtonStyle = 'default' | 'cancel' | 'destructive';

export interface AlertButton {
  text: string;
  style?: AlertButtonStyle;
  onPress?: () => void;
}

interface AlertModalProps {
  visible: boolean;
  title: string;
  message?: string;
  buttons: AlertButton[];
  /** Android hardware back — dismiss without firing a button callback. */
  onRequestClose: () => void;
  /** Fired when any button is tapped (provider handles close + onPress). */
  onButtonPress: (button: AlertButton) => void;
}

/**
 * Styled replacement for the native `Alert.alert` dialog. Re-uses the same
 * overlay + card pattern as the "reset password" modal in login.tsx, the
 * theme tokens, and the base Button. Buttons are stacked vertically so long
 * localized labels (DE/FR) never truncate, regardless of count (1–3).
 *
 * Presentational only — visibility/state lives in AlertProvider.
 */
export default function AlertModal({
  visible,
  title,
  message,
  buttons,
  onRequestClose,
  onButtonPress,
}: AlertModalProps) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onRequestClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.buttons}>
            {buttons.map((b, i) => (
              <Button
                key={`${b.text}-${i}`}
                title={b.text}
                onPress={() => onButtonPress(b)}
                variant={b.style === 'cancel' ? 'outline' : 'primary'}
                style={b.style === 'destructive' ? styles.destructive : undefined}
              />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    // Translucent scrim derived from the theme text colour (~50%) instead of a
    // raw rgba black — keeps it on the palette.
    backgroundColor: colors.text + '80',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
  },
  title: {
    fontSize: fontSize.xl,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  message: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  buttons: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  destructive: {
    backgroundColor: colors.error,
  },
});
