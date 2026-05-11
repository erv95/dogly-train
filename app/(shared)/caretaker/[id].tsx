import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { getCaretakerById } from '../../../src/services/caretakers';
import { useAuth } from '../../../src/contexts/AuthContext';
import { Avatar, StarRating, Card, Button, Skeleton, SkeletonList } from '../../../src/components/ui';
import { VerifiedBadge } from '../../../src/components/VerifiedBadge';
import { PublicReviewsList } from '../../../src/components/PublicReviewsList';
import { colors, spacing, fontSize, borderRadius } from '../../../src/theme';
import { CaretakerProfile, CaretakerService, CaretakerPricing } from '../../../src/types';

const SERVICE_LABEL_KEY: Record<CaretakerService, string> = {
  walks: 'caretaker.serviceWalks',
  day_care: 'caretaker.serviceDayCare',
  overnight: 'caretaker.serviceOvernight',
  home_care: 'caretaker.serviceHomeCare',
};

const SERVICE_PRICE_KEY: Record<CaretakerService, keyof CaretakerPricing> = {
  walks: 'walk',
  day_care: 'dayCare',
  overnight: 'overnight',
  home_care: 'homeCare',
};

const SERVICE_PRICE_UNIT_KEY: Record<CaretakerService, string> = {
  walks: 'caretaker.perWalk',
  day_care: 'caretaker.perDay',
  overnight: 'caretaker.perNight',
  home_care: 'caretaker.perVisit',
};

export default function CaretakerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const { userData } = useAuth();

  const [caretaker, setCaretaker] = useState<CaretakerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadCaretaker = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(false);
    try {
      const data = await getCaretakerById(id);
      setCaretaker(data);
      if (data) {
        const headerTitle = data.accountType === 'business' && data.businessName
          ? data.businessName
          : data.displayName;
        navigation.setOptions({ title: headerTitle });
      }
    } catch (error) {
      console.error('Error loading caretaker:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [id, navigation]);

  useEffect(() => { loadCaretaker(); }, [loadCaretaker]);

  const isBoosted = useMemo(() => {
    if (!caretaker?.boostedUntil) return false;
    const date = (caretaker.boostedUntil as any).toDate?.();
    return date && date > new Date();
  }, [caretaker?.boostedUntil]);

  const minPrice = useMemo(() => {
    if (!caretaker) return 0;
    const prices: number[] = [];
    if (caretaker.pricing.walk && caretaker.pricing.walk > 0) prices.push(caretaker.pricing.walk);
    if (caretaker.pricing.dayCare && caretaker.pricing.dayCare > 0) prices.push(caretaker.pricing.dayCare);
    if (caretaker.pricing.overnight && caretaker.pricing.overnight > 0) prices.push(caretaker.pricing.overnight);
    if (caretaker.pricing.homeCare && caretaker.pricing.homeCare > 0) prices.push(caretaker.pricing.homeCare);
    return prices.length > 0 ? Math.min(...prices) : 0;
  }, [caretaker]);

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20 }}>
        <Skeleton width={80} height={80} borderRadius={40} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton width="70%" height={18} />
          <Skeleton width="50%" height={14} />
          <Skeleton width="40%" height={12} />
        </View>
      </View>
      <SkeletonList count={3} />
    </View>
  );

  if (loadError) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="cloud-offline-outline" size={64} color={colors.textLight} />
        <Text style={styles.errorText}>{t('common.error')}</Text>
        <TouchableOpacity onPress={loadCaretaker} style={styles.retryBtn} activeOpacity={0.85}>
          <Text style={styles.retryBtnText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!caretaker) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={64} color={colors.textLight} />
        <Text style={styles.errorText}>{t('common.noResults')}</Text>
      </View>
    );
  }

  const isOwner = userData?.role === 'owner';
  const isBusiness = caretaker.accountType === 'business';
  const displayTitle = isBusiness && caretaker.businessName ? caretaker.businessName : caretaker.displayName;
  const currencySymbol = caretaker.currency === 'EUR' ? '€' : caretaker.currency;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Header */}
      <View style={styles.profileHeader}>
        <Avatar uri={caretaker.photoURL} name={displayTitle} size={100} />
        <Text style={styles.name}>{displayTitle}</Text>
        <VerifiedBadge visible={caretaker.verified === true} size="md" style={{ marginTop: 4 }} />
        {isBusiness && (
          <View style={styles.businessTag}>
            <Ionicons name="business" size={12} color={colors.secondary} />
            <Text style={styles.businessTagText}>{t('caretaker.business')}</Text>
          </View>
        )}
        {caretaker.city ? (
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.city}>{caretaker.city}</Text>
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
          <StarRating rating={caretaker.averageRating} size={16} />
          <Text style={styles.statValue}>{caretaker.averageRating.toFixed(1)}</Text>
          <Text style={styles.statLabel}>{t('trainer.avgRating')}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{caretaker.totalReviews}</Text>
          <Text style={styles.statLabel}>{t('trainer.totalReviews')}</Text>
        </View>
        {minPrice > 0 && (
          <>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.priceValue}>
                {t('caretaker.fromPrice', { price: minPrice, currency: currencySymbol })}
              </Text>
              <Text style={styles.statLabel}>{t('caretaker.pricing')}</Text>
            </View>
          </>
        )}
      </View>

      {/* Capacity (business only) */}
      {isBusiness && caretaker.capacity ? (
        <Card style={styles.section}>
          <View style={styles.capacityRow}>
            <Ionicons name="people" size={20} color={colors.primary} />
            <Text style={styles.capacityText}>
              {t('caretaker.capacitySlots', { count: caretaker.capacity })}
            </Text>
          </View>
        </Card>
      ) : null}

      {/* Bio */}
      {caretaker.bio ? (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>{t('caretaker.bio')}</Text>
          <Text style={styles.bioText}>{caretaker.bio}</Text>
        </Card>
      ) : null}

      {/* Experience */}
      {caretaker.experience ? (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>{t('caretaker.experience')}</Text>
          <Text style={styles.sectionText}>{caretaker.experience}</Text>
        </Card>
      ) : null}

      {/* Services */}
      {caretaker.services.length > 0 && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>{t('caretaker.services')}</Text>
          <View style={styles.chipContainer}>
            {caretaker.services.map((s, i) => (
              <View key={i} style={styles.chip}>
                <Text style={styles.chipText}>{t(SERVICE_LABEL_KEY[s])}</Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      {/* Tariffs table */}
      {caretaker.services.length > 0 && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>{t('caretaker.tariffs')}</Text>
          {caretaker.services.map((service) => {
            const price = caretaker.pricing[SERVICE_PRICE_KEY[service]];
            return (
              <View key={service} style={styles.tariffRow}>
                <Text style={styles.tariffLabel}>{t(SERVICE_LABEL_KEY[service])}</Text>
                <Text style={styles.tariffValue}>
                  {price && price > 0
                    ? `${price}${currencySymbol} ${t(SERVICE_PRICE_UNIT_KEY[service])}`
                    : t('caretaker.noTariffSet')}
                </Text>
              </View>
            );
          })}
        </Card>
      )}

      {/* Certifications */}
      {caretaker.certifications.length > 0 && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>{t('caretaker.certifications')}</Text>
          {caretaker.certifications.map((c, i) => (
            <View key={i} style={styles.certRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={styles.certText}>{c}</Text>
            </View>
          ))}
        </Card>
      )}

      {/* Public reviews */}
      <PublicReviewsList providerId={caretaker.id} totalReviews={caretaker.totalReviews} />

      {/* Actions — only for owners */}
      {isOwner && (
        <View style={styles.actions}>
          <Button
            title={t('bookings.flow.bookCta')}
            onPress={() => router.push(`/(shared)/book/${caretaker.id}`)}
            size="lg"
          />
          <Button
            title={t('caretaker.contact')}
            onPress={() => router.push(`/(shared)/chat/${caretaker.id}`)}
            variant="outline"
            size="lg"
          />
          <Button
            title={t('caretaker.leaveReview')}
            onPress={() => router.push(`/(shared)/review/${caretaker.id}`)}
            variant="outline"
            size="lg"
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: spacing.xxl },
  errorContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: colors.background, gap: spacing.md,
  },
  errorText: { fontSize: fontSize.md, color: colors.textSecondary },
  retryBtn: {
    backgroundColor: colors.primary, paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md, borderRadius: borderRadius.full, marginTop: spacing.md,
  },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: fontSize.sm },
  profileHeader: {
    alignItems: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.lg,
  },
  name: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.text, marginTop: spacing.md, textAlign: 'center' },
  businessTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.secondary + '15',
    paddingHorizontal: spacing.sm, paddingVertical: 2,
    borderRadius: borderRadius.full, marginTop: spacing.xs,
  },
  businessTagText: { fontSize: fontSize.xs, color: colors.secondary, fontWeight: '600' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs },
  city: { fontSize: fontSize.sm, color: colors.textSecondary },
  boostBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.boost + '20',
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: borderRadius.full, marginTop: spacing.sm,
  },
  boostText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.boost },
  statsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    paddingVertical: spacing.lg, marginHorizontal: spacing.lg,
    backgroundColor: colors.backgroundSecondary, borderRadius: borderRadius.lg,
  },
  statItem: { alignItems: 'center', gap: 4, flex: 1 },
  statDivider: { width: 1, height: 40, backgroundColor: colors.border },
  statValue: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  priceValue: { fontSize: fontSize.md, fontWeight: '700', color: colors.primary, textAlign: 'center' },
  statLabel: { fontSize: fontSize.xs, color: colors.textSecondary, textAlign: 'center' },
  section: { marginHorizontal: spacing.lg, marginTop: spacing.md },
  sectionTitle: {
    fontSize: fontSize.sm, fontWeight: '700', color: colors.text,
    marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  bioText: { fontSize: fontSize.md, color: colors.text, lineHeight: 22 },
  sectionText: { fontSize: fontSize.md, color: colors.text },
  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    backgroundColor: colors.secondary + '15',
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  chipText: { fontSize: fontSize.sm, color: colors.secondary, fontWeight: '600' },
  tariffRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  tariffLabel: { fontSize: fontSize.sm, color: colors.text, fontWeight: '500' },
  tariffValue: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '700' },
  capacityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  capacityText: { fontSize: fontSize.md, color: colors.text, fontWeight: '600' },
  certRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  certText: { fontSize: fontSize.sm, color: colors.text },
  actions: { padding: spacing.lg, gap: spacing.sm, marginTop: spacing.md },
});
