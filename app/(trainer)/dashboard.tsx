import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { Card, Button, StarRating } from '../../src/components/ui';
import { CoinBalancePill } from '../../src/components/CoinBalancePill';
import BookingStatsCard from '../../src/components/BookingStatsCard';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../../src/theme';
import { TrainerProfile } from '../../src/types';
import { getBoostTimeRemaining } from '../../src/utils/boost';

export default function TrainerDashboardScreen() {
  const { t } = useTranslation();
  const { userData } = useAuth();
  const router = useRouter();
  const trainer = userData as TrainerProfile | null;

  const boostTime = useMemo(
    () => getBoostTimeRemaining(trainer?.boostedUntil),
    [trainer?.boostedUntil]
  );
  const isBoosted = boostTime !== null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header greeting */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>
              {t('auth.welcome').split(' ').slice(0, 1).join('')},{' '}
              {trainer?.displayName?.split(' ')[0] ?? ''}
            </Text>
            <Text style={styles.subtitle}>{t('trainer.dashboard')}</Text>
          </View>
          <CoinBalancePill />
        </View>

        {/* Pending approval banner */}
        {trainer && !trainer.isActive && (
          <View style={styles.pendingBanner}>
            <Ionicons name="time-outline" size={20} color={colors.warning} />
            <Text style={styles.pendingText}>{t('trainer.pendingApproval')}</Text>
          </View>
        )}

        {/* Boost status */}
        {isBoosted && (
          <View style={styles.boostBanner}>
            <Ionicons name="flash" size={20} color={colors.boost} />
            <View>
              <Text style={styles.boostTitle}>{t('trainer.boostActive')}</Text>
              <Text style={styles.boostExpiry}>
                {t('trainer.boostExpires', { hours: boostTime.hours, minutes: boostTime.minutes })}
              </Text>
            </View>
          </View>
        )}

        {/* Stats cards */}
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Ionicons name="star" size={24} color={colors.star} />
            <Text style={styles.statValue}>
              {trainer?.averageRating?.toFixed(1) ?? '0.0'}
            </Text>
            <Text style={styles.statLabel}>{t('trainer.avgRating')}</Text>
          </Card>
          <Card style={styles.statCard}>
            <Ionicons name="chatbubbles-outline" size={24} color={colors.secondary} />
            <Text style={styles.statValue}>{trainer?.totalReviews ?? 0}</Text>
            <Text style={styles.statLabel}>{t('trainer.totalReviews')}</Text>
          </Card>
          <Card style={styles.statCard}>
            <Ionicons name="wallet-outline" size={24} color={colors.primary} />
            <Text style={styles.statValue}>{trainer?.coinBalance ?? 0}</Text>
            <Text style={styles.statLabel}>{t('trainer.coins')}</Text>
          </Card>
        </View>

        {/* Booking stats */}
        <View style={{ marginBottom: spacing.lg }}>
          <BookingStatsCard />
        </View>

        {/* Rating display */}
        {(trainer?.averageRating ?? 0) > 0 && (
          <Card style={styles.ratingCard}>
            <Text style={styles.ratingCardTitle}>{t('trainer.avgRating')}</Text>
            <View style={styles.ratingRow}>
              <StarRating rating={trainer?.averageRating ?? 0} size={28} />
              <Text style={styles.ratingNumber}>
                {trainer?.averageRating?.toFixed(1)}
              </Text>
            </View>
            <Text style={styles.ratingCount}>
              {trainer?.totalReviews ?? 0} {t('trainer.totalReviews').toLowerCase()}
            </Text>
          </Card>
        )}

        {/* Quick actions */}
        <View style={styles.quickActions}>
          <Button
            title={t('trainer.myProfile')}
            onPress={() => router.push('/(trainer)/my-profile')}
            variant="outline"
          />
          <Button
            title={t('coins.buyCoins')}
            onPress={() => router.push('/(trainer)/coins')}
            variant="outline"
          />
          {!isBoosted && (
            <Button
              title={t('coins.activateBoost')}
              onPress={() => router.push('/(trainer)/coins')}
              variant="primary"
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: {
    marginBottom: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  greeting: {
    fontSize: 28,
    fontFamily: fontFamily.bold,
    color: colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
    marginTop: 2,
  },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warning + '15',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
  },
  pendingText: {
    color: colors.warning,
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    flex: 1,
  },
  boostBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.boost + '15',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.boost,
  },
  boostTitle: {
    color: colors.text,
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
  },
  boostExpiry: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  statValue: {
    fontSize: 28,
    fontFamily: fontFamily.bold,
    color: colors.text,
    marginTop: spacing.xs,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: fontFamily.semibold,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  ratingCard: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    marginBottom: spacing.lg,
  },
  ratingCardTitle: {
    fontSize: 11,
    fontFamily: fontFamily.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ratingNumber: {
    fontSize: 32,
    fontFamily: fontFamily.bold,
    color: colors.text,
    letterSpacing: -0.8,
  },
  ratingCount: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  quickActions: {
    gap: spacing.sm,
  },
});
