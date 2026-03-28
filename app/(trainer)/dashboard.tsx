import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { Card, Button, StarRating } from '../../src/components/ui';
import { colors, spacing, fontSize, borderRadius } from '../../src/theme';
import { TrainerProfile } from '../../src/types';

function getBoostTimeRemaining(boostedUntil: any): { hours: number; minutes: number } | null {
  if (!boostedUntil) return null;
  const end = boostedUntil.toDate ? boostedUntil.toDate() : new Date(boostedUntil);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  if (diff <= 0) return null;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return { hours, minutes };
}

export default function TrainerDashboardScreen() {
  const { t } = useTranslation();
  const { userData } = useAuth();
  const router = useRouter();
  const trainer = userData as TrainerProfile | null;

  const boostTime = getBoostTimeRemaining(trainer?.boostedUntil);
  const isBoosted = boostTime !== null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header greeting */}
        <View style={styles.header}>
          <Text style={styles.greeting}>
            {t('auth.welcome').split(' ').slice(0, 1).join('')},{' '}
            {trainer?.displayName?.split(' ')[0] ?? ''}
          </Text>
          <Text style={styles.subtitle}>{t('trainer.dashboard')}</Text>
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
    marginBottom: spacing.lg,
  },
  greeting: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.xs,
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
    fontWeight: '600',
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
    fontWeight: '700',
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
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  statValue: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.xs,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  ratingCard: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    marginBottom: spacing.lg,
  },
  ratingCardTitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ratingNumber: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.text,
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
