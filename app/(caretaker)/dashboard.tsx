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
import { CaretakerProfile } from '../../src/types';
import { getBoostTimeRemaining } from '../../src/utils/boost';
import { getGreetingSlot } from '../../src/services/dailyRecommendations';

export default function CaretakerDashboardScreen() {
  const { t } = useTranslation();
  const { userData } = useAuth();
  const router = useRouter();
  const caretaker = userData as CaretakerProfile | null;

  const boostTime = useMemo(
    () => getBoostTimeRemaining(caretaker?.boostedUntil),
    [caretaker?.boostedUntil]
  );
  const isBoosted = boostTime !== null;
  const profileIncomplete = caretaker && (!caretaker.services || caretaker.services.length === 0);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header greeting */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>
              {t(`daily.${getGreetingSlot(new Date())}Named`, {
                name: caretaker?.displayName?.split(' ')[0] ?? '',
                context: caretaker?.gender === 'female' ? 'female' : '',
              })}
            </Text>
            <Text style={styles.subtitle}>{t('caretaker.dashboard')}</Text>
          </View>
          <CoinBalancePill />
        </View>

        {/* Pending approval banner */}
        {caretaker && !caretaker.isActive && (
          <View style={styles.pendingBanner}>
            <Ionicons name="time-outline" size={20} color={colors.warning} />
            <Text style={styles.pendingText}>{t('caretaker.pendingApproval')}</Text>
          </View>
        )}

        {/* Incomplete profile prompt */}
        {profileIncomplete && (
          <View style={styles.warningBanner}>
            <Ionicons name="alert-circle-outline" size={20} color={colors.info} />
            <Text style={styles.warningText}>{t('caretaker.completeProfilePrompt')}</Text>
          </View>
        )}

        {/* Boost status */}
        {isBoosted && (
          <View style={styles.boostBanner}>
            <Ionicons name="flash" size={20} color={colors.boost} />
            <View>
              <Text style={styles.boostTitle}>{t('caretaker.boostActive')}</Text>
              <Text style={styles.boostExpiry}>
                {t('caretaker.boostExpires', { hours: boostTime.hours, minutes: boostTime.minutes })}
              </Text>
            </View>
          </View>
        )}

        {/* Stats cards */}
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Ionicons name="star" size={24} color={colors.star} />
            <Text style={styles.statValue}>
              {caretaker?.averageRating?.toFixed(1) ?? '0.0'}
            </Text>
            <Text style={styles.statLabel} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
              {t('trainer.avgRating')}
            </Text>
          </Card>
          <Card style={styles.statCard}>
            <Ionicons name="chatbubbles-outline" size={24} color={colors.secondary} />
            <Text style={styles.statValue}>{caretaker?.totalReviews ?? 0}</Text>
            <Text style={styles.statLabel} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
              {t('trainer.totalReviews')}
            </Text>
          </Card>
          <Card style={styles.statCard}>
            <Ionicons name="wallet-outline" size={24} color={colors.primary} />
            <Text style={styles.statValue}>{caretaker?.coinBalance ?? 0}</Text>
            <Text style={styles.statLabel} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
              {t('caretaker.coins')}
            </Text>
          </Card>
        </View>

        {/* Booking stats */}
        <View style={{ marginBottom: spacing.lg }}>
          <BookingStatsCard />
        </View>

        {/* Rating display */}
        {(caretaker?.averageRating ?? 0) > 0 && (
          <Card style={styles.ratingCard}>
            <Text style={styles.ratingCardTitle}>{t('trainer.avgRating')}</Text>
            <View style={styles.ratingRow}>
              <StarRating rating={caretaker?.averageRating ?? 0} size={28} />
              <Text style={styles.ratingNumber}>
                {caretaker?.averageRating?.toFixed(1)}
              </Text>
            </View>
            <Text style={styles.ratingCount}>
              {caretaker?.totalReviews ?? 0} {t('trainer.totalReviews').toLowerCase()}
            </Text>
          </Card>
        )}

        {/* Quick actions */}
        <View style={styles.quickActions}>
          <Button
            title={t('caretaker.myProfile')}
            onPress={() => router.push('/(caretaker)/my-profile')}
            variant="outline"
          />
          <Button
            title={t('coins.buyCoins')}
            onPress={() => router.push('/(caretaker)/coins')}
            variant="outline"
          />
          {!isBoosted && (
            <Button
              title={t('coins.activateBoost')}
              onPress={() => router.push('/(caretaker)/coins')}
              variant="primary"
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { marginBottom: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  greeting: { fontSize: 28, fontFamily: fontFamily.bold, color: colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, fontFamily: fontFamily.medium, color: colors.textSecondary, marginTop: 2 },
  pendingBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.warning + '15', borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.md,
    borderLeftWidth: 4, borderLeftColor: colors.warning,
  },
  pendingText: { color: colors.warning, fontFamily: fontFamily.semibold, fontSize: fontSize.sm, flex: 1 },
  warningBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.info + '15', borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.md,
    borderLeftWidth: 4, borderLeftColor: colors.info,
  },
  warningText: { color: colors.info, fontFamily: fontFamily.semibold, fontSize: fontSize.sm, flex: 1 },
  boostBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.boost + '15', borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.md,
    borderLeftWidth: 4, borderLeftColor: colors.boost,
  },
  boostTitle: { color: colors.text, fontFamily: fontFamily.semibold, fontSize: fontSize.sm },
  boostExpiry: { color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: spacing.lg },
  statValue: { fontSize: 28, fontFamily: fontFamily.bold, color: colors.text, marginTop: spacing.xs, letterSpacing: -0.5 },
  statLabel: { fontSize: 11, fontFamily: fontFamily.semibold, color: colors.textSecondary, marginTop: 4, textAlign: 'center', letterSpacing: 0.8, textTransform: 'uppercase' },
  ratingCard: { alignItems: 'center', paddingVertical: spacing.lg, marginBottom: spacing.lg },
  ratingCardTitle: { fontSize: 11, fontFamily: fontFamily.semibold, color: colors.textSecondary, marginBottom: spacing.sm, letterSpacing: 0.8, textTransform: 'uppercase' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ratingNumber: { fontSize: 32, fontFamily: fontFamily.bold, color: colors.text, letterSpacing: -0.8 },
  ratingCount: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: spacing.xs },
  quickActions: { gap: spacing.sm },
});
