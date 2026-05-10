import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  getBooking,
  cancelBooking,
  markBookingCompleted,
} from '../../../src/services/bookings';
import { cancelRecurringSeries } from '../../../src/services/recurringBookings';
import { Booking } from '../../../src/types';
import { BOOKING_TIMEZONE } from '../../../src/config/booking';
import { useAuth } from '../../../src/contexts/AuthContext';
import BizumPaymentBlock from '../../../src/components/BizumPaymentBlock';
import { Avatar } from '../../../src/components/ui';
import { Confetti } from '../../../src/components/Confetti';
import { useHaptics } from '../../../src/hooks/useHaptics';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../../src/theme';

const SERVICE_LABEL_KEYS: Record<string, string> = {
  training: 'bookings.service.training',
  walk: 'bookings.service.walk',
  day_care: 'bookings.service.day_care',
  overnight: 'bookings.service.overnight',
  home_care: 'bookings.service.home_care',
};

const STATUS_META: Record<string, { color: string; bg: string; iconKey: any }> = {
  confirmed:           { color: '#27AE60', bg: '#27AE6022', iconKey: 'checkmark-circle' },
  completed:           { color: '#2D9CDB', bg: '#2D9CDB22', iconKey: 'flag' },
  cancelled_by_owner:  { color: '#EF4444', bg: '#EF444422', iconKey: 'close-circle' },
  cancelled_by_provider:{ color: '#F59E0B', bg: '#F59E0B22', iconKey: 'close-circle' },
  expired:             { color: '#9CA3AF', bg: '#9CA3AF22', iconKey: 'time-outline' },
};

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { firebaseUser, userData } = useAuth();
  const haptics = useHaptics();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<'cancel' | 'complete' | null>(null);
  const [confetti, setConfetti] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const b = await getBooking(id);
      setBooking(b);
    } catch (e) {
      console.error('getBooking', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={styles.loader} color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  if (!booking) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Stack.Screen options={{ title: t('bookings.detail.title') }} />
        <View style={styles.empty}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.textLight} />
          <Text style={styles.emptyText}>{t('bookings.detail.notFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isOwner = booking.ownerId === firebaseUser?.uid;
  const isProvider = booking.providerId === firebaseUser?.uid;
  const counterpartUid = isOwner ? booking.providerId : booking.ownerId;
  const counterpartName = isOwner ? booking.providerDisplayName : booking.ownerDisplayName;
  const counterpartPhoto = isOwner ? booking.providerPhotoURL : booking.ownerPhotoURL;
  const counterpartPhone = isOwner ? booking.providerBizumPhone : booking.ownerPhone;

  const meta = STATUS_META[booking.status] ?? STATUS_META.confirmed;
  const date = booking.serviceAt.toDate();
  const dateLabel = date.toLocaleDateString(undefined, {
    timeZone: BOOKING_TIMEZONE, weekday: 'long', day: 'numeric', month: 'long',
  });
  const timeLabel = date.toLocaleTimeString(undefined, {
    timeZone: BOOKING_TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });

  const canCancel = booking.status === 'confirmed';
  const canComplete = isProvider
    && booking.status === 'confirmed'
    && Date.now() >= booking.serviceEndAt.toMillis() - 60 * 60 * 1000; // -1h margin
  // Live tracking is allowed within ±2h of serviceAt while booking is confirmed
  const canStartLive = booking.status === 'confirmed'
    && Math.abs(Date.now() - booking.serviceAt.toMillis()) < 2 * 60 * 60 * 1000;

  const doCancelSeries = async () => {
    if (!booking?.seriesId) return;
    setWorking('cancel');
    try {
      await cancelRecurringSeries(booking.seriesId);
      haptics.warning();
      await load();
    } catch (e: any) {
      haptics.error();
      Alert.alert(t('common.error'), t('authErrors.generic'));
    } finally {
      setWorking(null);
    }
  };

  const doCancel = () => {
    // If this booking belongs to a series, ask whether to cancel just this one
    // or the whole series. Single bookings keep the existing 2-button alert.
    if (booking?.seriesId) {
      Alert.alert(
        t('bookings.recurring.cancelChoiceTitle'),
        t('bookings.recurring.cancelChoiceBody', {
          index: booking.seriesIndex ?? 0,
          total: booking.seriesTotal ?? 0,
        }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('bookings.recurring.cancelOnlyThis'),
            onPress: () => doCancelSingle(),
          },
          {
            text: t('bookings.recurring.cancelWholeSeries'),
            style: 'destructive',
            onPress: () => doCancelSeries(),
          },
        ],
      );
      return;
    }
    return doCancelSingleConfirm();
  };

  const doCancelSingle = async () => {
    if (!booking) return;
    setWorking('cancel');
    try {
      await cancelBooking(booking.id);
      haptics.warning();
      await load();
    } catch (e: any) {
      haptics.error();
      const code = e?.message ?? 'unknown';
      Alert.alert(t('common.error'), t(`bookings.errors.${code}`, { defaultValue: t('bookings.errors.unknown') }));
    } finally {
      setWorking(null);
    }
  };

  const doCancelSingleConfirm = () => {
    Alert.alert(
      t('bookings.detail.cancelTitle'),
      t('bookings.detail.cancelBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('bookings.detail.cancelCta'),
          style: 'destructive',
          onPress: async () => {
            setWorking('cancel');
            try {
              await cancelBooking(booking.id);
              haptics.warning();
              await load();
            } catch (e: any) {
              haptics.error();
              const code = e?.message ?? 'unknown';
              Alert.alert(t('common.error'), t(`bookings.errors.${code}`, { defaultValue: t('bookings.errors.unknown') }));
            } finally {
              setWorking(null);
            }
          },
        },
      ],
    );
  };

  const doComplete = async () => {
    setWorking('complete');
    try {
      await markBookingCompleted(booking.id);
      haptics.success();
      setConfetti(true);
      await load();
    } catch (e: any) {
      haptics.error();
      const code = e?.message ?? 'unknown';
      Alert.alert(t('common.error'), t(`bookings.errors.${code}`, { defaultValue: t('bookings.errors.unknown') }));
    } finally {
      setWorking(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: t('bookings.detail.title') }} />
      <Confetti trigger={confetti} onDone={() => setConfetti(false)} />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Counterpart header */}
        <View style={styles.header}>
          <Avatar uri={counterpartPhoto} name={counterpartName} size={64} />
          <View style={{ flex: 1 }}>
            <Text style={styles.counterpartName} numberOfLines={1}>{counterpartName}</Text>
            <Text style={styles.subhead}>
              🐾 {booking.dogName} · {t(SERVICE_LABEL_KEYS[booking.service] ?? booking.service)}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: meta.bg }]}>
            <Ionicons name={meta.iconKey} size={12} color={meta.color} />
            <Text style={[styles.badgeText, { color: meta.color }]}>
              {t(`bookings.status.${booking.status}`)}
            </Text>
          </View>
        </View>

        {/* Recurring series badge */}
        {booking.seriesId && booking.seriesIndex && booking.seriesTotal && (
          <View style={styles.seriesBadge}>
            <Ionicons name="repeat" size={14} color={colors.primary} />
            <Text style={styles.seriesBadgeText}>
              {t('bookings.recurring.badge', {
                index: booking.seriesIndex,
                total: booking.seriesTotal,
              })}
            </Text>
          </View>
        )}

        {/* Date / time block */}
        <View style={styles.dateBlock}>
          <Text style={styles.dateBig}>{dateLabel}</Text>
          <View style={styles.timeRow}>
            <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.timeText}>{timeLabel}</Text>
            <Text style={styles.dot}>·</Text>
            <Text style={styles.timeText}>{booking.durationMinutes} min</Text>
          </View>
        </View>

        {/* Bizum / chat block — only meaningful for confirmed bookings */}
        {booking.status === 'confirmed' && (
          <BizumPaymentBlock
            phone={counterpartPhone}
            counterpartUid={counterpartUid}
            counterpartName={counterpartName}
            priceEurInfo={booking.priceEurInfo}
          />
        )}

        {/* Notes */}
        {booking.notes && (
          <View style={styles.notesBox}>
            <Text style={styles.sectionTitle}>{t('bookings.detail.notesLabel')}</Text>
            <Text style={styles.notesText}>{booking.notes}</Text>
          </View>
        )}

        {/* Price info (when completed/cancelled, no Bizum block above) */}
        {booking.status !== 'confirmed' && booking.priceEurInfo > 0 && (
          <View style={styles.notesBox}>
            <Text style={styles.sectionTitle}>{t('bookings.detail.priceLabel')}</Text>
            <Text style={styles.notesText}>{booking.priceEurInfo} €</Text>
          </View>
        )}

        {/* Live tracking shortcut — visible to both parties when applicable */}
        {canStartLive && (
          <TouchableOpacity
            style={[styles.btn, styles.btnLive]}
            onPress={() => router.push(`/(shared)/live-session/${booking.id}`)}
          >
            <Ionicons name="location" size={18} color={colors.textOnPrimary} />
            <Text style={styles.btnPrimaryText}>
              {isProvider ? t('liveSession.startCta') : t('liveSession.viewLive')}
            </Text>
          </TouchableOpacity>
        )}

        {/* Actions */}
        {(canCancel || canComplete) && (
          <View style={styles.actionsRow}>
            {canComplete && (
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary]}
                onPress={doComplete}
                disabled={working === 'complete'}
              >
                {working === 'complete'
                  ? <ActivityIndicator color={colors.textOnPrimary} />
                  : (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color={colors.textOnPrimary} />
                      <Text style={styles.btnPrimaryText}>{t('bookings.detail.markCompleted')}</Text>
                    </>
                  )}
              </TouchableOpacity>
            )}
            {canCancel && (
              <TouchableOpacity
                style={[styles.btn, styles.btnDestructive]}
                onPress={doCancel}
                disabled={working === 'cancel'}
              >
                {working === 'cancel'
                  ? <ActivityIndicator color="#fff" />
                  : (
                    <>
                      <Ionicons name="close-circle" size={18} color="#fff" />
                      <Text style={styles.btnDestructiveText}>{t('bookings.detail.cancelCta')}</Text>
                    </>
                  )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Hint when service not yet finished — for provider */}
        {isProvider
         && booking.status === 'confirmed'
         && !canComplete
         && (
          <Text style={styles.providerHint}>{t('bookings.detail.completeAfterEnds')}</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  loader: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyText: { color: colors.textSecondary, fontSize: fontSize.md },
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md, backgroundColor: colors.background,
    borderRadius: borderRadius.lg, ...shadow.sm,
  },
  counterpartName: { fontSize: fontSize.lg, fontWeight: '900', color: colors.text },
  subhead: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  badgeText: { fontSize: 11, fontWeight: '800' },
  seriesBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary + '15',
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  seriesBadgeText: { fontSize: 12, color: colors.primary, fontWeight: '800' },

  dateBlock: {
    backgroundColor: colors.background,
    padding: spacing.md, borderRadius: borderRadius.lg, ...shadow.sm,
  },
  dateBig: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text, textTransform: 'capitalize' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  timeText: { fontSize: fontSize.md, color: colors.textSecondary, fontWeight: '700' },
  dot: { color: colors.textLight, marginHorizontal: 2 },

  notesBox: {
    backgroundColor: colors.background,
    padding: spacing.md, borderRadius: borderRadius.lg, ...shadow.sm,
    gap: 4,
  },
  sectionTitle: {
    fontSize: 10, fontWeight: '800', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  notesText: { fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },

  actionsRow: { flexDirection: 'row', gap: spacing.sm },
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: spacing.md, borderRadius: borderRadius.full,
  },
  btnPrimary: { backgroundColor: colors.primary, ...shadow.md },
  btnLive: { backgroundColor: colors.success, marginTop: spacing.md, ...shadow.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md, borderRadius: borderRadius.full },
  btnPrimaryText: { color: colors.textOnPrimary, fontWeight: '800', fontSize: fontSize.md },
  btnDestructive: { backgroundColor: colors.error },
  btnDestructiveText: { color: '#fff', fontWeight: '800', fontSize: fontSize.md },

  providerHint: {
    fontSize: fontSize.xs, color: colors.textSecondary,
    textAlign: 'center', fontStyle: 'italic',
  },
});
