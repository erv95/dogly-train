import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../src/contexts/AuthContext';
import { getTrainerById } from '../../../src/services/trainers';
import { hasReviewed, submitReview } from '../../../src/services/reviews';
import { Avatar, StarRating, Button, Input } from '../../../src/components/ui';
import { colors, spacing, fontSize, borderRadius } from '../../../src/theme';
import { TrainerProfile } from '../../../src/types';

export default function ReviewScreen() {
  const { trainerId } = useLocalSearchParams<{ trainerId: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const { firebaseUser } = useAuth();

  const [trainer, setTrainer] = useState<TrainerProfile | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    navigation.setOptions({ title: t('reviews.writeReview') });
  }, [t, navigation]);

  useEffect(() => {
    if (!trainerId || !firebaseUser) return;
    (async () => {
      try {
        const [trainerData, reviewed] = await Promise.all([
          getTrainerById(trainerId),
          hasReviewed(firebaseUser.uid, trainerId),
        ]);
        setTrainer(trainerData);
        setAlreadyReviewed(reviewed);
      } catch (error) {
        console.error('Error loading review data:', error);
      } finally {
        setInitialLoading(false);
      }
    })();
  }, [trainerId, firebaseUser]);

  const handleSubmit = async () => {
    if (!firebaseUser || !trainerId || rating === 0) return;

    setLoading(true);
    try {
      await submitReview(firebaseUser.uid, trainerId, rating, comment);
      Alert.alert(t('common.ok'), t('reviews.reviewSent'), [
        { text: t('common.ok'), onPress: () => router.back() },
      ]);
    } catch (error) {
      Alert.alert(t('common.error'), t('authErrors.generic'));
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (alreadyReviewed) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="checkmark-circle" size={64} color={colors.success} />
        <Text style={styles.alreadyText}>{t('reviews.alreadyReviewed')}</Text>
        <Button
          title={t('common.back')}
          onPress={() => router.back()}
          variant="outline"
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Trainer info */}
        {trainer && (
          <View style={styles.trainerInfo}>
            <Avatar uri={trainer.photoURL} name={trainer.displayName} size={64} />
            <Text style={styles.trainerName}>{trainer.displayName}</Text>
            {trainer.city ? (
              <Text style={styles.trainerCity}>{trainer.city}</Text>
            ) : null}
          </View>
        )}

        {/* Rating */}
        <View style={styles.ratingSection}>
          <Text style={styles.sectionLabel}>{t('reviews.rating')}</Text>
          <StarRating
            rating={rating}
            size={40}
            editable
            onRate={setRating}
          />
          {rating > 0 && (
            <Text style={styles.ratingText}>{rating}/5</Text>
          )}
        </View>

        {/* Comment */}
        <View style={styles.commentSection}>
          <Input
            label={t('reviews.comment')}
            value={comment}
            onChangeText={setComment}
            placeholder={t('reviews.comment')}
            multiline
            numberOfLines={5}
          />
        </View>

        {/* Submit */}
        <Button
          title={t('reviews.submitReview')}
          onPress={handleSubmit}
          loading={loading}
          size="lg"
          disabled={rating === 0}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  loadingText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  alreadyText: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  scrollContent: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  trainerInfo: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  trainerName: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.sm,
  },
  trainerCity: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  ratingSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    paddingVertical: spacing.lg,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
  },
  sectionLabel: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  ratingText: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.primary,
    marginTop: spacing.sm,
  },
  commentSection: {
    marginBottom: spacing.lg,
  },
});
