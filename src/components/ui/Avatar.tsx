import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { colors, borderRadius, fontFamily } from '../../theme';

interface AvatarProps {
  uri: string | null;
  name: string;
  size?: number;
}

export default function Avatar({ uri, name, size = 48 }: AvatarProps) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[
          styles.image,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
        accessible
        accessibilityLabel={name}
        accessibilityRole="image"
      />
    );
  }

  return (
    <View
      style={[
        styles.placeholder,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
      accessible
      accessibilityLabel={name}
      accessibilityRole="image"
    >
      <Text style={[styles.initials, { fontSize: size * 0.35 }]}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: colors.backgroundSecondary,
  },
  placeholder: {
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: colors.textOnPrimary,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
  },
});
