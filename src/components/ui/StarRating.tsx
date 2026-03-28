import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../../theme';

interface StarRatingProps {
  rating: number;
  size?: number;
  editable?: boolean;
  onRate?: (rating: number) => void;
}

export default function StarRating({
  rating,
  size = 20,
  editable = false,
  onRate,
}: StarRatingProps) {
  const stars = [1, 2, 3, 4, 5];

  return (
    <View style={styles.container}>
      {stars.map((star) => {
        const filled = star <= Math.round(rating);
        const StarWrapper = editable ? TouchableOpacity : View;

        return (
          <StarWrapper
            key={star}
            onPress={editable ? () => onRate?.(star) : undefined}
          >
            <Ionicons
              name={filled ? 'star' : 'star-outline'}
              size={size}
              color={colors.star}
            />
          </StarWrapper>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
});
