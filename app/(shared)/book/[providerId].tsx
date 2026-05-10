import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../src/config/firebase';
import { useAuth } from '../../../src/contexts/AuthContext';
import { getDogsByOwner } from '../../../src/services/dogs';
import { getAvailability, madridParts } from '../../../src/services/availability';
import { createBooking, type CreateBookingError } from '../../../src/services/bookings';
import {
  createRecurringBookings,
  previewRecurringSeries,
  type OccurrenceAnalysis,
} from '../../../src/services/recurringBookings';
import { RecurringPreviewModal } from '../../../src/components/RecurringPreviewModal';
import {
  Dog,
  WeeklyAvailability,
  BookingService,
  TrainerProfile,
  CaretakerProfile,
} from '../../../src/types';
import {
  BOOKING_DURATION_OPTIONS,
  BOOKING_NOTES_MAX,
  BOOKING_TIMEZONE,
} from '../../../src/config/booking';
import BookingSlotPicker from '../../../src/components/BookingSlotPicker';
import { Avatar } from '../../../src/components/ui';
import { Confetti } from '../../../src/components/Confetti';
import { useHaptics } from '../../../src/hooks/useHaptics';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../../src/theme';

type Step = 'pick' | 'confirm';

const SERVICE_LABEL_KEYS: Record<BookingService, string> = {
  training: 'bookings.service.training',
  walk: 'bookings.service.walk',
  day_care: 'bookings.service.day_care',
  overnight: 'bookings.service.overnight',
  home_care: 'bookings.service.home_care',
};

export default function BookProviderScreen() {
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { firebaseUser, userData } = useAuth();

  const haptics = useHaptics();
  const [confetti, setConfetti] = useState(false);
  const [provider, setProvider] = useState<TrainerProfile | CaretakerProfile | null>(null);
  const [availability, setAvailability] = useState<WeeklyAvailability | null>(null);
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState<Step>('pick');
  const [duration, setDuration] = useState<number>(60);
  const [service, setService] = useState<BookingService>('training');
  const [selectedSlotStart, setSelectedSlotStart] = useState<number | null>(null);
  const [selectedDogId, setSelectedDogId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Recurring booking toggle (weekly). Trainer max 8 (anything beyond opens
  // chat); caretaker max 4 weeks (operationally unrealistic to do continuous
  // weekly care for longer than that).
  const [recurring, setRecurring] = useState(false);
  const [weeksCount, setWeeksCount] = useState<number>(4);
  // Recurring preview modal — shown before creation when recurring is on
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewOccurrences, setPreviewOccurrences] = useState<OccurrenceAnalysis[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!providerId || !firebaseUser) return;
      let cancelled = false;
      (async () => {
        setLoading(true);
        try {
          const [providerSnap, avail, ownerDogs] = await Promise.all([
            getDoc(doc(db, 'users', providerId)),
            getAvailability(providerId),
            getDogsByOwner(firebaseUser.uid),
          ]);
          if (cancelled) return;
          if (!providerSnap.exists()) {
            Alert.alert(t('common.error'), t('bookings.flow.providerNotFound'));
            router.back();
            return;
          }
          const p = { id: providerSnap.id, ...(providerSnap.data() as any) } as TrainerProfile | CaretakerProfile;
          setProvider(p);
          setAvailability(avail);
          setDogs(ownerDogs);
          if (ownerDogs.length > 0 && !selectedDogId) setSelectedDogId(ownerDogs[0].id);
          // Default service depending on provider role
          if (p.role === 'caretaker') setService('walk');
          else setService('training');
        } catch (e) {
          console.error('book load error', e);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => { cancelled = true; };
    }, [providerId, firebaseUser?.uid])
  );

  const services: BookingService[] = useMemo(() => {
    if (!provider) return ['training'];
    if (provider.role === 'trainer') return ['training'];
    return ((provider as CaretakerProfile).services ?? ['walk']) as BookingService[];
  }, [provider]);

  const priceEurInfo = useMemo(() => {
    if (!provider) return 0;
    const hours = duration / 60;
    if (provider.role === 'trainer') {
      return Math.round((provider.pricePerSession ?? 0) * hours);
    }
    const map: Record<string, keyof CaretakerProfile['pricing']> = {
      walk: 'walk', day_care: 'dayCare', overnight: 'overnight', home_care: 'homeCare',
    };
    const key = map[service];
    const base = key ? (provider.pricing?.[key] ?? 0) : 0;
    if (service === 'overnight') return base;
    return Math.round(base * hours);
  }, [provider, service, duration]);

  const selectedDog = dogs.find((d) => d.id === selectedDogId) ?? null;

  // Chips per role — see comment near the recurring state declaration.
  const weekChips: number[] = useMemo(() => {
    if (provider?.role === 'caretaker') return [1, 2, 3, 4];
    return [2, 4, 6, 8];
  }, [provider?.role]);

  /** "+10 semanas" CTA for trainers — opens the chat with a pre-filled message
   *  so the user can negotiate longer engagements directly. Caretakers don't
   *  see this button (continuous care beyond 4 weeks isn't supported). */
  const handleMoreWeeks = () => {
    if (!provider || !firebaseUser) return;
    Alert.alert(
      t('bookings.recurring.moreWeeksTitle'),
      t('bookings.recurring.moreWeeksBody', { name: provider.displayName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('bookings.recurring.moreWeeksOpenChat'),
          onPress: () => {
            const chatId = [firebaseUser.uid, provider.id].sort().join('_');
            const prefill = t('bookings.recurring.moreWeeksChatPrefill', { name: provider.displayName });
            router.push({
              pathname: '/(shared)/chat/[id]',
              params: { id: chatId, prefill },
            });
          },
        },
      ],
    );
  };

  const handleSubmit = async () => {
    if (!selectedSlotStart || !selectedDogId || !provider) return;

    // Recurring flow → fetch preview first so the user sees green/red weeks
    // and can opt-in to skipping the unavailable ones.
    if (recurring) {
      setPreviewVisible(true);
      setPreviewLoading(true);
      setPreviewOccurrences([]);
      try {
        const result = await previewRecurringSeries({
          providerId: provider.id,
          dogId: selectedDogId,
          service,
          firstSlotAt: new Date(selectedSlotStart).toISOString(),
          durationMinutes: duration,
          weeksCount,
        });
        setPreviewOccurrences(result.occurrences);
      } catch (e: any) {
        haptics.error();
        setPreviewVisible(false);
        const code = (e?.message ?? 'unknown') as CreateBookingError;
        Alert.alert(
          t('common.error'),
          t(`bookings.errors.${code}`, {
            minutes: e?.minLeadMinutes ?? 120,
            days: e?.maxHorizonDays ?? 60,
            defaultValue: t('bookings.errors.unknown'),
          }),
        );
      } finally {
        setPreviewLoading(false);
      }
      return;
    }

    // Single booking — straightforward create
    setSubmitting(true);
    try {
      const result = await createBooking({
        providerId: provider.id,
        dogId: selectedDogId,
        service,
        serviceAt: new Date(selectedSlotStart).toISOString(),
        durationMinutes: duration,
        notes: notes.trim() || undefined,
      });
      haptics.success();
      setConfetti(true);
      router.replace(`/(shared)/bookings/${result.bookingId}`);
    } catch (e: any) {
      const code: CreateBookingError = (e?.message ?? 'unknown') as CreateBookingError;
      haptics.error();
      // i18next interpolates {{minutes}} / {{days}} when those keys are present
      // — passing them always is harmless for codes that don't need them.
      Alert.alert(
        t('common.error'),
        t(`bookings.errors.${code}`, {
          minutes: e?.minLeadMinutes ?? 120,
          days: e?.maxHorizonDays ?? 60,
          defaultValue: t('bookings.errors.unknown'),
        }),
      );
      if (code === 'slot_taken') setSelectedSlotStart(null);
      setStep('pick');
    } finally {
      setSubmitting(false);
    }
  };

  // Confirm action from the preview modal — creates only the available weeks.
  const confirmRecurringCreate = async () => {
    if (!selectedSlotStart || !selectedDogId || !provider) return;
    setSubmitting(true);
    try {
      const result = await createRecurringBookings({
        providerId: provider.id,
        dogId: selectedDogId,
        service,
        firstSlotAt: new Date(selectedSlotStart).toISOString(),
        durationMinutes: duration,
        weeksCount,
        notes: notes.trim() || undefined,
        skipUnavailable: true,
      });
      haptics.success();
      setConfetti(true);
      setPreviewVisible(false);
      // If some weeks were skipped, hint at it briefly via system alert before
      // navigating — the user already saw the breakdown but a recap is nice.
      if (result.skipped.length > 0) {
        Alert.alert(
          t('bookings.recurring.preview.createdTitle'),
          t('bookings.recurring.preview.createdBody', {
            created: result.bookingIds.length,
            skipped: result.skipped.length,
          }),
          [{ text: t('common.ok'), onPress: () => router.replace(`/(shared)/bookings/${result.bookingIds[0]}`) }],
        );
      } else {
        router.replace(`/(shared)/bookings/${result.bookingIds[0]}`);
      }
    } catch (e: any) {
      const code: CreateBookingError = (e?.message ?? 'unknown') as CreateBookingError;
      haptics.error();
      Alert.alert(
        t('common.error'),
        t(`bookings.errors.${code}`, {
          minutes: e?.minLeadMinutes ?? 120,
          days: e?.maxHorizonDays ?? 60,
          defaultValue: t('bookings.errors.unknown'),
        }),
      );
      setPreviewVisible(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !provider) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={styles.loader} color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  if (!availability || availability.weekly.every((d) => d.windows.length === 0)) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Stack.Screen options={{ title: t('bookings.flow.title') }} />
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={48} color={colors.textLight} />
          <Text style={styles.emptyTitle}>{t('bookings.flow.noAvailabilityTitle')}</Text>
          <Text style={styles.emptyBody}>{t('bookings.flow.noAvailabilityBody')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (dogs.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Stack.Screen options={{ title: t('bookings.flow.title') }} />
        <View style={styles.empty}>
          <Ionicons name="paw-outline" size={48} color={colors.textLight} />
          <Text style={styles.emptyTitle}>{t('bookings.flow.noDogsTitle')}</Text>
          <Text style={styles.emptyBody}>{t('bookings.flow.noDogsBody')}</Text>
          <TouchableOpacity
            style={styles.emptyCta}
            onPress={() => router.replace('/(shared)/dog-form')}
          >
            <Text style={styles.emptyCtaText}>{t('bookings.flow.addDogCta')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const slotDate = selectedSlotStart ? new Date(selectedSlotStart) : null;
  const slotLabel = slotDate
    ? `${slotDate.toLocaleDateString(undefined, { timeZone: BOOKING_TIMEZONE, weekday: 'long', day: 'numeric', month: 'long' })} · ${slotDate.toLocaleTimeString(undefined, { timeZone: BOOKING_TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`
    : '';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: t('bookings.flow.title') }} />
      <Confetti trigger={confetti} onDone={() => setConfetti(false)} />
      <RecurringPreviewModal
        visible={previewVisible}
        loading={previewLoading}
        occurrences={previewOccurrences}
        submitting={submitting}
        onCancel={() => { if (!submitting) setPreviewVisible(false); }}
        onConfirm={confirmRecurringCreate}
      />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Provider header */}
        <View style={styles.providerHeader}>
          <Avatar uri={provider.photoURL} name={provider.displayName} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={styles.providerName} numberOfLines={1}>{provider.displayName}</Text>
            <Text style={styles.providerRole}>
              {provider.role === 'trainer' ? t('auth.trainer') : t('auth.caretaker')}
              {provider.city ? ` · ${provider.city}` : ''}
            </Text>
          </View>
        </View>

        {step === 'pick' && (
          <>
            {/* Service (caretakers expose multiple) */}
            {services.length > 1 && (
              <>
                <Text style={styles.sectionTitle}>{t('bookings.flow.serviceLabel')}</Text>
                <View style={styles.chipRow}>
                  {services.map((s) => {
                    const active = service === s;
                    return (
                      <TouchableOpacity
                        key={s}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => setService(s)}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {t(SERVICE_LABEL_KEYS[s])}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* Duration */}
            <Text style={styles.sectionTitle}>{t('bookings.flow.durationLabel')}</Text>
            <View style={styles.chipRow}>
              {BOOKING_DURATION_OPTIONS.map((d) => {
                const active = duration === d;
                return (
                  <TouchableOpacity
                    key={d}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => { setDuration(d); setSelectedSlotStart(null); }}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{d} min</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Slot picker */}
            <BookingSlotPicker
              providerId={provider.id}
              availability={availability}
              durationMinutes={duration}
              selectedSlotStart={selectedSlotStart}
              onSelectSlotStart={setSelectedSlotStart}
            />

            <TouchableOpacity
              style={[styles.cta, !selectedSlotStart && styles.ctaDisabled]}
              onPress={() => setStep('confirm')}
              disabled={!selectedSlotStart}
            >
              <Text style={styles.ctaText}>{t('bookings.flow.continueCta')}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textOnPrimary} />
            </TouchableOpacity>
          </>
        )}

        {step === 'confirm' && (
          <>
            {/* Summary */}
            <View style={styles.summary}>
              <View style={styles.summaryRow}>
                <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.summaryText}>{slotLabel}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Ionicons name="hourglass-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.summaryText}>{duration} min · {t(SERVICE_LABEL_KEYS[service])}</Text>
              </View>
              {priceEurInfo > 0 && (
                <View style={styles.summaryRow}>
                  <Ionicons name="cash-outline" size={16} color={colors.textSecondary} />
                  <Text style={styles.summaryText}>{t('bookings.flow.priceInfoLine', { amount: priceEurInfo })}</Text>
                </View>
              )}
            </View>

            {/* Dog selector */}
            <Text style={styles.sectionTitle}>{t('bookings.flow.dogLabel')}</Text>
            <View style={styles.chipRow}>
              {dogs.map((d) => {
                const active = selectedDogId === d.id;
                return (
                  <TouchableOpacity
                    key={d.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setSelectedDogId(d.id)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{d.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Notes */}
            <Text style={styles.sectionTitle}>{t('bookings.flow.notesLabel')}</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder={t('bookings.flow.notesPlaceholder')}
              placeholderTextColor={colors.textLight}
              maxLength={BOOKING_NOTES_MAX}
              multiline
              style={styles.notesInput}
            />

            {/* Recurring toggle — turn this booking into a weekly series */}
            <View style={styles.recurringBox}>
              <TouchableOpacity
                style={styles.recurringHeader}
                onPress={() => setRecurring((r) => !r)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={recurring ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={recurring ? colors.primary : colors.textSecondary}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.recurringTitle}>{t('bookings.recurring.toggleLabel')}</Text>
                  <Text style={styles.recurringHint}>{t('bookings.recurring.toggleHint')}</Text>
                </View>
              </TouchableOpacity>
              {recurring && (
                <View style={styles.weeksRow}>
                  {weekChips.map((n) => (
                    <TouchableOpacity
                      key={n}
                      style={[styles.weekChip, weeksCount === n && styles.weekChipActive]}
                      onPress={() => setWeeksCount(n)}
                    >
                      <Text style={[styles.weekChipText, weeksCount === n && styles.weekChipTextActive]}>
                        {t('bookings.recurring.weeks', { count: n })}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {provider?.role === 'trainer' && (
                    <TouchableOpacity
                      style={[styles.weekChip, styles.weekChipMore]}
                      onPress={handleMoreWeeks}
                    >
                      <Ionicons name="chatbubble-ellipses-outline" size={12} color={colors.primary} />
                      <Text style={[styles.weekChipText, styles.weekChipMoreText]}>
                        {t('bookings.recurring.moreWeeksLabel')}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>

            <Text style={styles.disclaimer}>{t('bookings.flow.paymentDisclaimer')}</Text>

            <View style={styles.actionsRow}>
              <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={() => setStep('pick')}>
                <Text style={styles.btnSecondaryText}>{t('common.back')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary, submitting && styles.ctaDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting
                  ? <ActivityIndicator color={colors.textOnPrimary} />
                  : (
                    <>
                      <Ionicons name="checkmark" size={18} color={colors.textOnPrimary} />
                      <Text style={styles.btnPrimaryText}>{t('bookings.flow.confirmCta')}</Text>
                    </>
                  )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  loader: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text, textAlign: 'center' },
  emptyBody: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
  emptyCta: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: borderRadius.full, backgroundColor: colors.primary,
  },
  emptyCtaText: { color: colors.textOnPrimary, fontWeight: '800' },

  body: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },

  providerHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.sm, backgroundColor: colors.background,
    borderRadius: borderRadius.lg, ...shadow.sm,
  },
  providerName: { fontSize: fontSize.md, fontWeight: '800', color: colors.text },
  providerRole: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },

  sectionTitle: {
    fontSize: 10, fontWeight: '800', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.sm,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.sm + 2, paddingVertical: 6,
    borderRadius: borderRadius.full, backgroundColor: colors.background,
    borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textSecondary },
  chipTextActive: { color: colors.textOnPrimary },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.md, borderRadius: borderRadius.full,
    backgroundColor: colors.primary, marginTop: spacing.md, ...shadow.md,
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: colors.textOnPrimary, fontWeight: '800', fontSize: fontSize.md },

  summary: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: 6,
    ...shadow.sm,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600', flex: 1 },

  notesInput: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.sm, minHeight: 80,
    color: colors.text, fontSize: fontSize.sm, textAlignVertical: 'top',
  },

  recurringBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.background,
    gap: spacing.sm,
  },
  recurringHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  recurringTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  recurringHint: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  weeksRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  weekChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.background,
  },
  weekChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  weekChipText: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '700' },
  weekChipTextActive: { color: colors.textOnPrimary },
  weekChipMore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  weekChipMoreText: { color: colors.primary },

  disclaimer: {
    fontSize: fontSize.xs, color: colors.textSecondary, fontStyle: 'italic',
    marginTop: spacing.sm,
  },

  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: spacing.md, borderRadius: borderRadius.full,
  },
  btnPrimary: { backgroundColor: colors.primary, ...shadow.md },
  btnSecondary: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  btnPrimaryText: { color: colors.textOnPrimary, fontWeight: '800', fontSize: fontSize.md },
  btnSecondaryText: { color: colors.text, fontWeight: '700', fontSize: fontSize.md },
});
