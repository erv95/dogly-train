import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Booking } from '../types';
import { BOOKING_TIMEZONE } from '../config/booking';
import { Avatar } from './ui';
import { colors, spacing, fontSize, borderRadius, shadow } from '../theme';

interface Props {
  booking: Booking;
  /** Whose POV is rendering — controls which counterpart is shown. */
  viewerRole: 'owner' | 'provider';
}

const STATUS_META: Record<string, { color: string; bg: string; iconKey: any }> = {
  confirmed:           { color: '#27AE60', bg: '#27AE6022', iconKey: 'checkmark-circle' },
  completed:           { color: '#2D9CDB', bg: '#2D9CDB22', iconKey: 'flag' },
  cancelled_by_owner:  { color: '#EF4444', bg: '#EF444422', iconKey: 'close-circle' },
  cancelled_by_provider:{ color: '#F59E0B', bg: '#F59E0B22', iconKey: 'close-circle' },
  expired:             { color: '#9CA3AF', bg: '#9CA3AF22', iconKey: 'time-outline' },
};

const SERVICE_LABEL_KEYS: Record<string, string> = {
  training: 'bookings.service.training',
  walk: 'bookings.service.walk',
  day_care: 'bookings.service.day_care',
  overnight: 'bookings.service.overnight',
  home_care: 'bookings.service.home_care',
};

function BookingCard({ booking, viewerRole }: Props) {
  const { t } = useTranslation();
  const router = useRouter();

  const counterpartName = viewerRole === 'owner' ? booking.providerDisplayName : booking.ownerDisplayName;
  const counterpartPhoto = viewerRole === 'owner' ? booking.providerPhotoURL : booking.ownerPhotoURL;
  const meta = STATUS_META[booking.status] ?? STATUS_META.confirmed;

  const date = booking.serviceAt.toDate();
  const dateLabel = date.toLocaleDateString(undefined, {
    timeZone: BOOKING_TIMEZONE, weekday: 'short', day: 'numeric', month: 'short',
  });
  const timeLabel = date.toLocaleTimeString(undefined, {
    timeZone: BOOKING_TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/(shared)/bookings/${booking.id}`)}
      activeOpacity={0.85}
    >
      <Avatar uri={counterpartPhoto} name={counterpartName} size={48} />
      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text style={styles.name} numberOfLines={1}>{counterpartName}</Text>
          <View style={[styles.badge, { backgroundColor: meta.bg }]}>
            <Ionicons name={meta.iconKey} size={11} color={meta.color} />
            <Text style={[styles.badgeText, { color: meta.color }]}>
              {t(`bookings.status.${booking.status}`)}
            </Text>
          </View>
        </View>
        <Text style={styles.metaLine} numberOfLines={1}>
          🐾 {booking.dogName} · {t(SERVICE_LABEL_KEYS[booking.service] ?? booking.service)}
        </Text>
        <View style={styles.bottomRow}>
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={12} color={colors.textSecondary} />
            <Text style={styles.metaText}>{dateLabel}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={12} color={colors.textSecondary} />
            <Text style={styles.metaText}>{timeLabel}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="hourglass-outline" size={12} color={colors.textSecondary} />
            <Text style={styles.metaText}>{booking.durationMinutes} min</Text>
          </View>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    ...shadow.sm,
  },
  body: { flex: 1, gap: 2 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1, fontSize: fontSize.md, fontWeight: '800', color: colors.text },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  badgeText: { fontSize: 10, fontWeight: '800' },
  metaLine: { fontSize: fontSize.xs, color: colors.textSecondary },
  bottomRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 2 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 10, color: colors.textSecondary, fontWeight: '600' },
});

// Memoized: BookingCard receives `booking` (which is an object reference that
// only changes when the underlying doc updates) and `viewerRole` (string). The
// default shallow equality check is exactly what we want — re-render only when
// the booking actually changes, not on every parent scroll-induced re-render.
export default React.memo(BookingCard);
