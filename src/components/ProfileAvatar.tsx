import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from './ui';
import { colors, spacing, fontSize } from '../theme';

/**
 * Reusable profile-photo widget: round Avatar + small camera badge overlay +
 * optional "Optional" hint when no photo is set. Tap dispatches the parent's
 * onPress (typically from `useProfilePhoto.handleChange`).
 *
 * Single source of truth for the photo-edit visual style — removes the three
 * near-identical copies in owner / trainer / caretaker my-profile screens.
 */

interface Props {
  /** Photo URL — `null` falls back to initials inside Avatar. */
  photoURL: string | null | undefined;
  /** Display name — used to derive initials and as accessibility label. */
  name: string;
  /** Avatar diameter. Defaults to 80 (owner/trainer styling). */
  size?: number;
  onPress: () => void;
  /** When true, the camera badge becomes a spinner. */
  loading?: boolean;
  /** When true and there's no photo, show "(Optional)" hint below. */
  showOptionalHint?: boolean;
}

export function ProfileAvatar({
  photoURL,
  name,
  size = 80,
  onPress,
  loading = false,
  showOptionalHint = true,
}: Props) {
  const { t } = useTranslation();
  const badgeSize = Math.round(size * 0.35);

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity onPress={onPress} disabled={loading} activeOpacity={0.85}>
        <Avatar uri={photoURL ?? null} name={name} size={size} />
        <View
          style={[
            styles.badge,
            {
              width: badgeSize,
              height: badgeSize,
              borderRadius: badgeSize / 2,
            },
          ]}
        >
          {loading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="camera" size={Math.round(badgeSize * 0.55)} color="#fff" />}
        </View>
      </TouchableOpacity>
      {showOptionalHint && !photoURL && (
        <Text style={styles.optionalHint}>{t('profile.photoOptionalLabel')}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  optionalHint: {
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: spacing.xs,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
