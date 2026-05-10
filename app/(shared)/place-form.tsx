import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../src/config/firebase';
import { proposePlace } from '../../src/services/places';
import { PlaceCategory, PlaceAmenity } from '../../src/types';
import { useAuth } from '../../src/contexts/AuthContext';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../src/theme';

const CATEGORIES: { key: PlaceCategory; icon: string }[] = [
  { key: 'park', icon: 'leaf-outline' },
  { key: 'restaurant', icon: 'restaurant-outline' },
  { key: 'beach', icon: 'sunny-outline' },
  { key: 'hotel', icon: 'bed-outline' },
  { key: 'shop', icon: 'storefront-outline' },
  { key: 'training_field', icon: 'fitness-outline' },
  { key: 'event', icon: 'calendar-outline' },
];

const AMENITIES: { key: PlaceAmenity; icon: string }[] = [
  { key: 'leash_off', icon: 'paw-outline' },
  { key: 'fenced', icon: 'lock-closed-outline' },
  { key: 'water', icon: 'water-outline' },
  { key: 'shade', icon: 'umbrella-outline' },
  { key: 'wifi', icon: 'wifi-outline' },
  { key: 'terrace', icon: 'sunny-outline' },
  { key: 'parking', icon: 'car-outline' },
  { key: 'small_dogs', icon: 'happy-outline' },
  { key: 'large_dogs', icon: 'paw-outline' },
];

export default function PlaceFormScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { firebaseUser } = useAuth();

  const [name, setName] = useState('');
  const [category, setCategory] = useState<PlaceCategory>('park');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [address, setAddress] = useState('');
  const [websiteURL, setWebsiteURL] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [amenities, setAmenities] = useState<Set<PlaceAmenity>>(new Set());
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [eventStartAt, setEventStartAt] = useState<Date | null>(null);
  const [eventEndAt, setEventEndAt] = useState<Date | null>(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const toggleAmenity = (a: PlaceAmenity) => {
    setAmenities((prev) => {
      const next = new Set(prev);
      if (next.has(a)) next.delete(a); else next.add(a);
      return next;
    });
  };

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    setPhotoUri(result.assets[0].uri);
  };

  const useCurrentLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('common.error'), t('trainer.locationDenied'));
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });

      try {
        const rev = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        if (rev[0]) {
          if (!city && rev[0].city) setCity(rev[0].city);
          if (!country && rev[0].country) setCountry(rev[0].country);
          if (!address && rev[0].street) {
            const parts = [rev[0].street, rev[0].streetNumber].filter(Boolean);
            setAddress(parts.join(', '));
          }
        }
      } catch { /* reverse geocode is best-effort */ }
    } catch {
      Alert.alert(t('common.error'), t('trainer.locationDenied'));
    } finally {
      setLocating(false);
    }
  };

  const validate = (): string | null => {
    if (!name.trim()) return t('places.errors.nameRequired');
    if (!description.trim()) return t('places.errors.descriptionRequired');
    if (!city.trim() || !country.trim()) return t('places.errors.cityCountryRequired');
    if (!coords) return t('places.errors.locationRequired');
    if (category === 'event' && !eventStartAt) return t('places.errors.eventStartRequired');
    if (eventStartAt && eventEndAt && eventEndAt <= eventStartAt) return t('places.errors.eventEndAfter');
    return null;
  };

  const submit = async () => {
    if (!firebaseUser) return;
    const err = validate();
    if (err) { Alert.alert(t('common.error'), err); return; }

    setSubmitting(true);
    try {
      let photoURL: string | undefined;
      if (photoUri) {
        const tmpId = `${Date.now()}`;
        const storageRef = ref(storage, `place_photos/${firebaseUser.uid}/${tmpId}.jpg`);
        const response = await fetch(photoUri);
        const blob = await response.blob();
        await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
        photoURL = await getDownloadURL(storageRef);
      }

      await proposePlace({
        submittedBy: firebaseUser.uid,
        name: name.trim(),
        category,
        description: description.trim(),
        latitude: coords!.lat,
        longitude: coords!.lng,
        city: city.trim(),
        country: country.trim(),
        address: address.trim() || undefined,
        photoURL,
        websiteURL: websiteURL.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        amenities: Array.from(amenities),
        eventStartAt: eventStartAt ?? undefined,
        eventEndAt: eventEndAt ?? undefined,
      });

      Alert.alert(t('places.proposeSuccessTitle'), t('places.proposeSuccessBody'), [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message ?? '');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>{t('places.proposeIntro')}</Text>

        {/* Photo */}
        <TouchableOpacity style={styles.photoBox} onPress={pickPhoto} activeOpacity={0.85}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} />
          ) : (
            <>
              <Ionicons name="camera-outline" size={32} color={colors.textLight} />
              <Text style={styles.photoText}>{t('places.addPhoto')}</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Name */}
        <Text style={styles.label}>{t('places.fields.name')} *</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('places.fields.namePlaceholder')}
          placeholderTextColor={colors.textLight}
          maxLength={120}
          style={styles.input}
        />

        {/* Category */}
        <Text style={styles.label}>{t('places.fields.category')} *</Text>
        <View style={styles.chipsWrap}>
          {CATEGORIES.map((c) => {
            const active = category === c.key;
            return (
              <TouchableOpacity
                key={c.key}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setCategory(c.key)}
                activeOpacity={0.85}
              >
                <Ionicons name={c.icon as any} size={14} color={active ? colors.textOnPrimary : colors.textSecondary} />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {t(`places.categories.${c.key}`)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Description */}
        <Text style={styles.label}>{t('places.fields.description')} *</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder={t('places.fields.descriptionPlaceholder')}
          placeholderTextColor={colors.textLight}
          multiline
          maxLength={500}
          style={[styles.input, styles.inputMultiline]}
        />

        {/* Location */}
        <Text style={styles.label}>{t('places.fields.location')} *</Text>
        <TouchableOpacity style={styles.locBtn} onPress={useCurrentLocation} disabled={locating}>
          {locating
            ? <ActivityIndicator color={colors.primary} />
            : <Ionicons name="locate" size={18} color={colors.primary} />}
          <Text style={styles.locBtnText}>
            {coords
              ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`
              : t('places.fields.useCurrentLocation')}
          </Text>
        </TouchableOpacity>

        {/* City / Country */}
        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{t('places.fields.city')} *</Text>
            <TextInput
              value={city}
              onChangeText={setCity}
              placeholder="Madrid"
              placeholderTextColor={colors.textLight}
              maxLength={80}
              style={styles.input}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{t('places.fields.country')} *</Text>
            <TextInput
              value={country}
              onChangeText={setCountry}
              placeholder="ES"
              placeholderTextColor={colors.textLight}
              maxLength={60}
              style={styles.input}
            />
          </View>
        </View>

        {/* Address */}
        <Text style={styles.label}>{t('places.fields.address')}</Text>
        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder={t('places.fields.addressPlaceholder')}
          placeholderTextColor={colors.textLight}
          maxLength={200}
          style={styles.input}
        />

        {/* Website + Phone */}
        <Text style={styles.label}>{t('places.fields.website')}</Text>
        <TextInput
          value={websiteURL}
          onChangeText={setWebsiteURL}
          placeholder="https://..."
          placeholderTextColor={colors.textLight}
          autoCapitalize="none"
          maxLength={200}
          style={styles.input}
        />
        <Text style={styles.label}>{t('places.fields.phone')}</Text>
        <TextInput
          value={contactPhone}
          onChangeText={setContactPhone}
          placeholder="+34 ..."
          placeholderTextColor={colors.textLight}
          keyboardType="phone-pad"
          maxLength={30}
          style={styles.input}
        />

        {/* Amenities */}
        <Text style={styles.label}>{t('places.fields.amenities')}</Text>
        <View style={styles.chipsWrap}>
          {AMENITIES.map((a) => {
            const active = amenities.has(a.key);
            return (
              <TouchableOpacity
                key={a.key}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => toggleAmenity(a.key)}
                activeOpacity={0.85}
              >
                <Ionicons name={a.icon as any} size={14} color={active ? colors.textOnPrimary : colors.textSecondary} />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {t(`places.amenityList.${a.key}`)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Event-only */}
        {category === 'event' && (
          <>
            <Text style={styles.label}>{t('places.fields.eventStart')} *</Text>
            <TouchableOpacity style={styles.locBtn} onPress={() => setShowStartPicker(true)}>
              <Ionicons name="calendar-outline" size={16} color={colors.primary} />
              <Text style={styles.locBtnText}>
                {eventStartAt ? eventStartAt.toLocaleString() : t('places.fields.pickDateTime')}
              </Text>
            </TouchableOpacity>
            {showStartPicker && (
              <DateTimePicker
                value={eventStartAt ?? new Date()}
                mode="datetime"
                onChange={(_, d) => {
                  setShowStartPicker(Platform.OS === 'ios');
                  if (d) setEventStartAt(d);
                }}
              />
            )}

            <Text style={styles.label}>{t('places.fields.eventEnd')}</Text>
            <TouchableOpacity style={styles.locBtn} onPress={() => setShowEndPicker(true)}>
              <Ionicons name="calendar-outline" size={16} color={colors.primary} />
              <Text style={styles.locBtnText}>
                {eventEndAt ? eventEndAt.toLocaleString() : t('places.fields.pickDateTime')}
              </Text>
            </TouchableOpacity>
            {showEndPicker && (
              <DateTimePicker
                value={eventEndAt ?? eventStartAt ?? new Date()}
                mode="datetime"
                onChange={(_, d) => {
                  setShowEndPicker(Platform.OS === 'ios');
                  if (d) setEventEndAt(d);
                }}
              />
            )}
          </>
        )}

        <TouchableOpacity style={styles.submit} onPress={submit} disabled={submitting}>
          {submitting
            ? <ActivityIndicator color={colors.textOnPrimary} />
            : (
              <>
                <Ionicons name="paper-plane" size={18} color={colors.textOnPrimary} />
                <Text style={styles.submitText}>{t('places.submitProposal')}</Text>
              </>
            )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  body: { padding: spacing.lg, gap: spacing.xs, paddingBottom: spacing.xxl },
  intro: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.sm },

  photoBox: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  photo: { width: '100%', height: '100%' },
  photoText: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: spacing.xs },

  label: { fontSize: fontSize.xs, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.sm, marginBottom: 4 },
  input: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    color: colors.text,
    fontSize: fontSize.sm,
  },
  inputMultiline: { minHeight: 90, textAlignVertical: 'top' },

  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textSecondary },
  chipTextActive: { color: colors.textOnPrimary },

  locBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  locBtnText: { color: colors.primary, fontWeight: '700', fontSize: fontSize.sm },

  row2: { flexDirection: 'row', gap: spacing.sm },

  submit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    marginTop: spacing.lg,
    ...shadow.md,
  },
  submitText: { color: colors.textOnPrimary, fontSize: fontSize.md, fontWeight: '800' },
});
