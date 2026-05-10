import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Linking,
  Platform,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { getPlace, getMyRating, ratePlace } from '../../../src/services/places';
import { Place, PlaceAmenity, PlaceRating } from '../../../src/types';
import { useAuth } from '../../../src/contexts/AuthContext';
import { StarRating } from '../../../src/components/ui';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../../src/theme';

const AMENITY_ICONS: Record<PlaceAmenity, string> = {
  leash_off: 'paw-outline',
  fenced: 'lock-closed-outline',
  water: 'water-outline',
  shade: 'umbrella-outline',
  wifi: 'wifi-outline',
  terrace: 'sunny-outline',
  parking: 'car-outline',
  small_dogs: 'happy-outline',
  large_dogs: 'paw-outline',
};

export default function PlaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { firebaseUser } = useAuth();

  const [place, setPlace] = useState<Place | null>(null);
  const [myRating, setMyRating] = useState<PlaceRating | null>(null);
  const [loading, setLoading] = useState(true);
  const [rateOpen, setRateOpen] = useState(false);
  const [pendingStars, setPendingStars] = useState(5);
  const [pendingComment, setPendingComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [p, r] = await Promise.all([
        getPlace(id),
        firebaseUser ? getMyRating(id, firebaseUser.uid) : Promise.resolve(null),
      ]);
      setPlace(p);
      setMyRating(r);
      if (r) {
        setPendingStars(r.rating);
        setPendingComment(r.comment ?? '');
      }
    } catch (e) {
      console.error('Error loading place:', e);
    } finally {
      setLoading(false);
    }
  }, [id, firebaseUser?.uid]);

  useEffect(() => { load(); }, [load]);

  const openMap = () => {
    if (!place) return;
    const label = encodeURIComponent(place.name);
    const lat = place.latitude;
    const lng = place.longitude;
    const url = Platform.select({
      ios: `maps:0,0?q=${label}@${lat},${lng}`,
      android: `geo:0,0?q=${lat},${lng}(${label})`,
    }) as string;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
    });
  };

  const openWebsite = () => {
    if (!place?.websiteURL) return;
    const url = place.websiteURL.startsWith('http') ? place.websiteURL : `https://${place.websiteURL}`;
    Linking.openURL(url).catch(() => Alert.alert(t('common.error')));
  };

  const callPhone = () => {
    if (!place?.contactPhone) return;
    Linking.openURL(`tel:${place.contactPhone}`).catch(() => Alert.alert(t('common.error')));
  };

  const submitRating = async () => {
    if (!place || !firebaseUser) return;
    setSubmitting(true);
    try {
      await ratePlace(place.id, firebaseUser.uid, pendingStars, pendingComment.trim() || undefined);
      setRateOpen(false);
      await load();
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message ?? '');
    } finally {
      setSubmitting(false);
    }
  };

  const eventDateLabel = useMemo(() => {
    if (!place?.eventStartAt) return null;
    const start = place.eventStartAt.toDate();
    const end = place.eventEndAt?.toDate();
    const dateFmt = (d: Date) => d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    return end ? `${dateFmt(start)} – ${dateFmt(end)}` : dateFmt(start);
  }, [place?.eventStartAt, place?.eventEndAt]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={styles.loader} color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  if (!place) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.empty}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.textLight} />
          <Text style={styles.emptyText}>{t('places.notFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: place.name }} />
      <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
        {place.photoURL ? (
          <Image source={{ uri: place.photoURL }} style={styles.hero} />
        ) : (
          <View style={[styles.hero, styles.heroPlaceholder]}>
            <Ionicons name="image-outline" size={48} color={colors.textLight} />
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.title}>{place.name}</Text>
          <View style={styles.rowSmall}>
            <Ionicons name="pricetag-outline" size={14} color={colors.primary} />
            <Text style={styles.metaPrimary}>{t(`places.categories.${place.category}`)}</Text>
            <Text style={styles.metaDot}>·</Text>
            <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.metaSecondary}>{place.city}, {place.country}</Text>
          </View>

          {place.totalRatings > 0 && (
            <View style={styles.rowSmall}>
              <StarRating rating={place.averageRating} size={16} />
              <Text style={styles.ratingText}>
                {place.averageRating.toFixed(1)} ({place.totalRatings})
              </Text>
            </View>
          )}

          {place.status !== 'approved' && (
            <View style={[styles.statusBadge, place.status === 'pending' ? styles.statusPending : styles.statusRejected]}>
              <Ionicons
                name={place.status === 'pending' ? 'time-outline' : 'close-circle-outline'}
                size={14}
                color={place.status === 'pending' ? colors.warning : colors.error}
              />
              <Text style={styles.statusText}>{t(`places.status.${place.status}`)}</Text>
            </View>
          )}
        </View>

        {eventDateLabel && (
          <View style={styles.section}>
            <View style={styles.eventBox}>
              <Ionicons name="calendar" size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.eventLabel}>{t('places.event')}</Text>
                <Text style={styles.eventDate}>{eventDateLabel}</Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('places.description')}</Text>
          <Text style={styles.description}>{place.description}</Text>
        </View>

        {place.address && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('places.address')}</Text>
            <Text style={styles.metaSecondary}>{place.address}</Text>
          </View>
        )}

        {place.amenities.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('places.amenities')}</Text>
            <View style={styles.amenitiesRow}>
              {place.amenities.map((a) => (
                <View key={a} style={styles.amenityChip}>
                  <Ionicons name={(AMENITY_ICONS[a] ?? 'checkmark-outline') as any} size={14} color={colors.primary} />
                  <Text style={styles.amenityText}>{t(`places.amenityList.${a}`)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={openMap}>
            <Ionicons name="navigate" size={18} color={colors.textOnPrimary} />
            <Text style={styles.actionBtnText}>{t('places.directions')}</Text>
          </TouchableOpacity>
          {place.contactPhone && (
            <TouchableOpacity style={[styles.actionBtn, styles.actionSecondary]} onPress={callPhone}>
              <Ionicons name="call" size={18} color={colors.primary} />
              <Text style={[styles.actionBtnText, styles.actionSecondaryText]}>{t('places.call')}</Text>
            </TouchableOpacity>
          )}
          {place.websiteURL && (
            <TouchableOpacity style={[styles.actionBtn, styles.actionSecondary]} onPress={openWebsite}>
              <Ionicons name="globe-outline" size={18} color={colors.primary} />
              <Text style={[styles.actionBtnText, styles.actionSecondaryText]}>{t('places.website')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {place.status === 'approved' && firebaseUser && (
          <View style={styles.section}>
            <View style={styles.rateBox}>
              <Text style={styles.rateTitle}>
                {myRating ? t('places.yourRating') : t('places.rateThisPlace')}
              </Text>
              {myRating && (
                <View style={styles.rowSmall}>
                  <StarRating rating={myRating.rating} size={18} />
                  {myRating.comment && (
                    <Text style={styles.myComment} numberOfLines={3}>{myRating.comment}</Text>
                  )}
                </View>
              )}
              <TouchableOpacity style={styles.rateBtn} onPress={() => setRateOpen(true)}>
                <Ionicons name="star" size={16} color={colors.textOnPrimary} />
                <Text style={styles.actionBtnText}>
                  {myRating ? t('places.editRating') : t('places.addRating')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Rate modal */}
      <Modal visible={rateOpen} transparent animationType="fade" onRequestClose={() => setRateOpen(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setRateOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('places.rateThisPlace')}</Text>
            <View style={styles.modalStars}>
              <StarRating rating={pendingStars} size={32} editable onRate={setPendingStars} />
            </View>
            <TextInput
              value={pendingComment}
              onChangeText={setPendingComment}
              placeholder={t('places.commentPlaceholder')}
              placeholderTextColor={colors.textLight}
              multiline
              maxLength={500}
              style={styles.modalInput}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setRateOpen(false)} disabled={submitting}>
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmit} onPress={submitRating} disabled={submitting}>
                {submitting
                  ? <ActivityIndicator color={colors.textOnPrimary} />
                  : <Text style={styles.actionBtnText}>{t('common.save')}</Text>}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  loader: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyText: { color: colors.textSecondary, fontSize: fontSize.md },

  scrollBody: { paddingBottom: spacing.xxl },
  hero: { width: '100%', height: 220, backgroundColor: colors.backgroundSecondary },
  heroPlaceholder: { alignItems: 'center', justifyContent: 'center' },

  section: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  rowSmall: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, flexWrap: 'wrap' },
  metaPrimary: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '700' },
  metaSecondary: { fontSize: fontSize.sm, color: colors.textSecondary },
  metaDot: { color: colors.textLight, marginHorizontal: 2 },
  ratingText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '700', marginLeft: 6 },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  statusPending: { backgroundColor: colors.warning + '20' },
  statusRejected: { backgroundColor: colors.error + '20' },
  statusText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.text },

  eventBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary + '10',
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  eventLabel: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '800', textTransform: 'uppercase' },
  eventDate: { fontSize: fontSize.sm, color: colors.text, fontWeight: '700', marginTop: 2 },

  sectionTitle: { fontSize: fontSize.sm, fontWeight: '800', color: colors.text, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  description: { fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },

  amenitiesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  amenityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary + '12',
  },
  amenityText: { fontSize: fontSize.xs, color: colors.text, fontWeight: '600' },

  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    flexWrap: 'wrap',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  actionSecondary: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.primary },
  actionBtnText: { color: colors.textOnPrimary, fontWeight: '800' },
  actionSecondaryText: { color: colors.primary },

  rateBox: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.sm,
  },
  rateTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.text },
  myComment: { flex: 1, fontSize: fontSize.sm, color: colors.textSecondary, marginLeft: spacing.sm },
  rateBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  modalCard: { width: '100%', backgroundColor: colors.background, borderRadius: borderRadius.lg, padding: spacing.lg, gap: spacing.md, ...shadow.lg },
  modalTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text, textAlign: 'center' },
  modalStars: { alignSelf: 'center' },
  modalInput: {
    minHeight: 80,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    color: colors.text,
    fontSize: fontSize.sm,
    textAlignVertical: 'top',
  },
  modalActions: { flexDirection: 'row', gap: spacing.sm },
  modalCancel: { flex: 1, padding: spacing.sm, borderRadius: borderRadius.full, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  modalCancelText: { color: colors.text, fontWeight: '700' },
  modalSubmit: { flex: 1, padding: spacing.sm, borderRadius: borderRadius.full, alignItems: 'center', backgroundColor: colors.primary },
});
