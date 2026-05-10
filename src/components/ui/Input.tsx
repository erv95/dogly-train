import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TextInputProps,
  ViewStyle,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, borderRadius, fontSize, spacing } from '../../theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
}

export default function Input({
  label,
  error,
  containerStyle,
  secureTextEntry: secureEntryProp,
  ...props
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const [secureVisible, setSecureVisible] = useState(false);

  const isSecure = secureEntryProp !== undefined && secureEntryProp !== false;

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.inputWrapper}>
        <TextInput
          style={[
            styles.input,
            focused && styles.inputFocused,
            error && styles.inputError,
            isSecure && styles.inputWithIcon,
          ]}
          placeholderTextColor={colors.textLight}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          secureTextEntry={isSecure ? !secureVisible : false}
          {...props}
        />
        {isSecure && (
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setSecureVisible((v) => !v)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={secureVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            accessibilityState={{ expanded: secureVisible }}
          >
            <Ionicons
              name={secureVisible ? 'eye-off-outline' : 'eye-outline'}
              size={22}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  inputWrapper: {
    position: 'relative',
  },
  input: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    fontSize: fontSize.md,
    color: colors.text,
  },
  inputWithIcon: {
    paddingRight: 44,
  },
  inputFocused: {
    borderColor: colors.primary,
  },
  inputError: {
    borderColor: colors.error,
  },
  eyeButton: {
    position: 'absolute',
    right: spacing.md,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  error: {
    fontSize: fontSize.xs,
    color: colors.error,
    marginTop: spacing.xs,
  },
});
