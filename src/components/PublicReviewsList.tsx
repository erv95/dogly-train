import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Card, StarRating } from './ui';
import { Skeleton } from './ui/Skeleton';
import { colors, spacing, fontSize, borderRadius } from '../theme';
import { getReviewsForProvider } from '../services/reviews';
import { Review } from '../types';

/**
 * Public reviews shown on a provider's detail page. Collapsed to the first
 * 3 entries with a "Show all" toggle. Each row is reviewer name + photo +
 * stars + comment + relative date. Built to be resilient to missing
 * denormalised fields (legacy reviews from before D.1).
 */

interface Props {
  providerId: string;
  totalReviews: number;
}

const INITIAL_VISIBLE = 3;

function formatRelativeDate(ts: any, locale: string): string {
  try {
    const d: Date = ts?.toDate?.() ?? new Date(ts);
    return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

export function PublicReviewsList({ providerId, totalReviews }: Props) {
  const { t, i18n } = useTranslation();
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const list = await getReviewsForProvider(providerId, 50);
      setReviews(list);
    } catch (err) {
      console.error('Failed to load public reviews', err);
      setError(true);
      setReviews([]);
    }
  }, [providerId]);

  useEffect(() => { load(); }, [load]);

  if (reviews === null) {
    return (
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>{t('reviews.publicSectionTitle')}</Text>
        <Skeleton width="80%" height={16} style={{ marginBottom: spacing.sm }} />
        <Skeleton width="60%" height={14} />
      </Card>
    );
  }

  if (error) {
    return (
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>{t('reviews.publicSectionTitle')}</Text>
        <TouchableOpacity onPress={load} style={styles.retryRow} activeOpacity={0.85}>
          <Ionicons name="refresh-outline" size={16} color={colors.primary} />
          <Text style={styles.retryText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </Card>
    );
  }

  if (reviews.length === 0) {
    return (
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>{t('reviews.publicSectionTitle')}</Text>
        <Text style={styles.emptyText}>{t('reviews.noReviewsYet')}</Text>
      </Card>
    );
  }

  const visible = expanded ? reviews : reviews.slice(0, INITIAL_VISIBLE);
  const canExpand = reviews.length > INITIAL_VISIBLE;

  // The badge derives from the actual reviews fetched, NOT from the
  // denormalised `totalReviews` prop. Otherwise the badge can disagree with
  // the visible list when the user just wrote a review (the screen-level
  // refetch lags by one navigation cycle even with useFocusEffect).
  const displayCount = reviews.length;

  return (
    <Card style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.sectionTitle}>{t('reviews.publicSectionTitle')}</Text>
        {displayCount > 0 && (
          <Text style={styles.countBadge}>{displayCount}</Text>
        )}
      </View>

      {visible.map((r, idx) => {
        const name = r.fromUserDisplayName?.trim() || t('reviews.anonymousReviewer');
        return (
          <View
            key={r.id}
            style={[styles.reviewRow, idx === visible.length - 1 && styles.lastReviewRow]}
          >
            <Avatar uri={r.fromUserPhotoURL ?? null} name={name} size={40} />
            <View style={styles.reviewBody}>
              <View style={styles.reviewHeader}>
                <Text style={styles.reviewerName} numberOfLines={1}>{name}</Text>
                <Text style={styles.reviewDate}>
                  {formatRelativeDate(r.createdAt, i18n.language)}
                </Text>
              </View>
              <StarRating rating={r.rating} size={14} />
              {r.comment ? (
                <Text style={styles.reviewComment}>{r.comment}</Text>
              ) : null}
            </View>
          </View>
        );
      })}

      {canExpand && (
        <TouchableOpacity
          onPress={() => setExpanded((v) => !v)}
          style={styles.expandRow}
          activeOpacity={0.85}
        >
          <Text style={styles.expandText}>
            {expanded ? t('reviews.collapseAll') : t('reviews.viewAll', { count: reviews.length })}
          </Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.primary}
          />
        </TouchableOpacity>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  section: {
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  countBadge: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    backgroundColor: colors.backgroundSecondary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  reviewRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  lastReviewRow: {
    borderBottomWidth: 0,
  },
  reviewBody: {
    flex: 1,
    gap: 4,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  reviewerName: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  reviewDate: {
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
  reviewComment: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginTop: 4,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  expandText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  retryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  retryText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
  },
});
