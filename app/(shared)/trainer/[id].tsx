import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { getTrainerById } from '../../../src/services/trainers';
import { useAuth } from '../../../src/contexts/AuthContext';
import { Avatar, StarRating, Card, Button } from '../../../src/components/ui';
import { ProfileSkeleton } from '../../../src/components/skeletons';
import { colors, spacing, fontSize, borderRadius } from '../../../src/theme';
import { TrainerProfile } from '../../../src/types';

export default function TrainerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const { userData } = useAuth();

  const [trainer, setTrainer] = useState<TrainerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadTrainer = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(false);
    try {
      const data = await getTrainerById(id);
      setTrainer(data);
      if (data) {
        navigation.setOptions({ title: data.displayName });
      }
    } catch (error) {
      console.error('Error loading trainer:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [id, navigation]);

  useEffect(() => { loadTrainer(); }, [loadTrainer]);

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ProfileSkeleton />
    </View>
  );

  if (loadError) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="cloud-offline-outline" size={64} color={colors.textLight} />
        <Text style={styles.errorText}>{t('common.error')}</Text>
        <TouchableOpacity onPress={loadTrainer} style={styles.retryBtn} activeOpacity={0.85}>
          <Text style={styles.retryBtnText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!trainer) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={64} color={colors.textLight} />
        <Text style={styles.errorText}>{t('common.noResults')}</Text>
      </View>
    );
  }

  const isBoosted = trainer.boostedUntil &&
    (trainer.boostedUntil as any).toDate?.() > new Date();
  const isOwner = userData?.role === 'owner';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Header */}
      <View style={styles.profileHeader}>
        <Avatar uri={trainer.photoURL} name={trainer.displayName} size={100} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.name}>{trainer.displayName}</Text>
          {trainer.verified && (
            <Ionicons name="shield-checkmark" size={20} color="#2D9CDB" />
          )}
        </View>
        {trainer.verified && (
          <Text style={{ fontSize: 11, color: '#2D9CDB', fontWeight: '700', marginTop: 2 }}>
            {t('identityVerification.verifiedBadge')}
          </Text>
        )}
        {trainer.city ? (
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.city}>{trainer.city}</Text>
          </View>
        ) : null}
        {isBoosted && (
          <View style={styles.boostBadge}>
            <Ionicons name="flash" size={14} color={colors.boost} />
            <Text style={styles.boostText}>{t('owner.featured')}</Text>
          </View>
        )}
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <StarRating rating={trainer.averageRating} size={16} />
          <Text style={styles.statValue}>{trainer.averageRating.toFixed(1)}</Text>
          <Text style={styles.statLabel}>{t('trainer.avgRating')}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{trainer.totalReviews}</Text>
          <Text style={styles.statLabel}>{t('trainer.totalReviews')}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.priceValue}>
            {trainer.pricePerSession}{trainer.currency === 'EUR' ? '€' : trainer.currency}
          </Text>
          <Text style={styles.statLabel}>{t('trainer.pricePerSession')}</Text>
        </View>
      </View>

      {/* Bio */}
      {trainer.bio ? (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>{t('trainer.bio')}</Text>
          <Text style={styles.bioText}>{trainer.bio}</Text>
        </Card>
      ) : null}

      {/* Experience */}
      {trainer.experience ? (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>{t('trainer.experience')}</Text>
          <Text style={styles.sectionText}>{trainer.experience}</Text>
        </Card>
      ) : null}

      {/* Specialties */}
      {trainer.specialties.length > 0 && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>{t('trainer.specialties')}</Text>
          <View style={styles.chipContainer}>
            {trainer.specialties.map((s, i) => (
              <View key={i} style={styles.chip}>
                <Text style={styles.chipText}>{s}</Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      {/* Certifications */}
      {trainer.certifications.length > 0 && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>{t('trainer.certifications')}</Text>
          {trainer.certifications.map((c, i) => (
            <View key={i} style={styles.certRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={styles.certText}>{c}</Text>
            </View>
          ))}
        </Card>
      )}

      {/* Actions — only for owners */}
      {isOwner && (
        <View style={styles.actions}>
          <Button
            title={t('bookings.flow.bookCta')}
            onPress={() => router.push(`/(shared)/book/${trainer.id}`)}
            size="lg"
          />
          <Button
            title={t('chat.startChat')}
            onPress={() => router.push(`/(shared)/chat/${trainer.id}`)}
            variant="outline"
            size="lg"
          />
          <Button
            title={t('reviews.writeReview')}
            onPress={() => router.push(`/(shared)/review/${trainer.id}`)}
            variant="outline"
            size="lg"
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    gap: spacing.md,
  },
  errorText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  retryBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    marginTop: spacing.md,
  },
  retryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: fontSize.sm,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  name: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.md,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  city: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  boostBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.boost + '20',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginTop: spacing.sm,
  },
  boostText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.boost,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: spacing.lg,
    marginHorizontal: spacing.lg,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
  },
  statItem: {
    alignItems: 'center',
    gap: 4,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
  },
  statValue: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
  },
  priceValue: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.primary,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  section: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bioText: {
    fontSize: fontSize.md,
    color: colors.text,
    lineHeight: 22,
  },
  sectionText: {
    fontSize: fontSize.md,
    color: colors.text,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: colors.secondary + '15',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  chipText: {
    fontSize: fontSize.sm,
    color: colors.secondary,
    fontWeight: '600',
  },
  certRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  certText: {
    fontSize: fontSize.sm,
    color: colors.text,
  },
  actions: {
    padding: spacing.lg,
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
