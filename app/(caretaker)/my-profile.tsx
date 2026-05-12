import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { geohashForLocation } from 'geofire-common';
import { useAuth } from '../../src/contexts/AuthContext';
import { signOut } from '../../src/services/auth';
import { updateCaretakerProfile } from '../../src/services/caretakers';
import { useProfilePhoto } from '../../src/hooks/useProfilePhoto';
import { Button, Input, Card } from '../../src/components/ui';
import { ProfileAvatar } from '../../src/components/ProfileAvatar';
import { colors, spacing, fontSize, borderRadius } from '../../src/theme';
import {
  CaretakerProfile,
  CaretakerService,
  CaretakerAccountType,
  CaretakerPricing,
} from '../../src/types';

const ALL_SERVICES: CaretakerService[] = ['walks', 'day_care', 'overnight', 'home_care'];

const SERVICE_ICONS: Record<CaretakerService, keyof typeof Ionicons.glyphMap> = {
  walks: 'walk',
  day_care: 'sunny',
  overnight: 'moon',
  home_care: 'home',
};

// Map CaretakerService → CaretakerPricing key
const SERVICE_PRICE_KEY: Record<CaretakerService, keyof CaretakerPricing> = {
  walks: 'walk',
  day_care: 'dayCare',
  overnight: 'overnight',
  home_care: 'homeCare',
};

const SERVICE_LABEL_KEY: Record<CaretakerService, string> = {
  walks: 'caretaker.serviceWalks',
  day_care: 'caretaker.serviceDayCare',
  overnight: 'caretaker.serviceOvernight',
  home_care: 'caretaker.serviceHomeCare',
};

const SERVICE_PRICE_LABEL_KEY: Record<CaretakerService, string> = {
  walks: 'caretaker.priceWalk',
  day_care: 'caretaker.priceDayCare',
  overnight: 'caretaker.priceOvernight',
  home_care: 'caretaker.priceHomeCare',
};

export default function CaretakerProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { firebaseUser, userData, setUserData } = useAuth();
  const caretaker = userData as CaretakerProfile | null;

  // Form state — initialize from existing profile
  const [accountType, setAccountType] = useState<CaretakerAccountType>(caretaker?.accountType ?? 'individual');
  const [businessName, setBusinessName] = useState(caretaker?.businessName ?? '');
  const [capacity, setCapacity] = useState(caretaker?.capacity?.toString() ?? '');
  const [displayName, setDisplayName] = useState(caretaker?.displayName ?? '');
  const [bio, setBio] = useState(caretaker?.bio ?? '');
  const [experience, setExperience] = useState(caretaker?.experience ?? '');
  const [city, setCity] = useState(caretaker?.city ?? '');
  const [bizumPhone, setBizumPhone] = useState(caretaker?.bizumPhone ?? '');
  const [currency, setCurrency] = useState(caretaker?.currency ?? 'EUR');
  const [services, setServices] = useState<CaretakerService[]>(caretaker?.services ?? []);
  const [pricing, setPricing] = useState<CaretakerPricing>(caretaker?.pricing ?? {});

  const [saving, setSaving] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);

  const { loading: photoLoading, handleChange: handleChangePhoto } = useProfilePhoto({
    currentPhoto: caretaker?.photoURL,
    updateProfile: (patch) => updateCaretakerProfile(firebaseUser!.uid, patch),
    onUpdated: (newUrl) => setUserData({ ...userData!, photoURL: newUrl }),
  });

  const toggleService = (service: CaretakerService) => {
    setServices((prev) => {
      if (prev.includes(service)) {
        return prev.filter((s) => s !== service);
      }
      return [...prev, service];
    });
  };

  const updatePrice = (service: CaretakerService, value: string) => {
    const numeric = parseFloat(value.replace(',', '.'));
    setPricing((prev) => ({
      ...prev,
      [SERVICE_PRICE_KEY[service]]: isNaN(numeric) ? undefined : numeric,
    }));
  };

  const handleGetLocation = async () => {
    setLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('common.error'), t('trainer.locationDenied'));
        return;
      }
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = location.coords;
      const geoHash = geohashForLocation([latitude, longitude]);

      let cityName = '';
      try {
        const [address] = await Location.reverseGeocodeAsync({ latitude, longitude });
        cityName = address?.city || address?.subregion || address?.region || '';
      } catch {
        cityName = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
      }

      setCity(cityName);
      if (firebaseUser) {
        await updateCaretakerProfile(firebaseUser.uid, {
          latitude,
          longitude,
          geoHash,
          city: cityName,
        });
        setUserData({
          ...userData!,
          latitude,
          longitude,
          geoHash,
          city: cityName,
        } as any);
        Alert.alert(t('common.ok'), t('trainer.locationObtained'));
      }
    } catch {
      Alert.alert(t('common.error'), t('authErrors.generic'));
    } finally {
      setLocationLoading(false);
    }
  };

  const handleSave = async () => {
    if (!firebaseUser) return;

    // Client-side validation
    if (services.length === 0) {
      Alert.alert(t('common.error'), t('caretaker.noServicesError'));
      return;
    }
    for (const service of services) {
      const priceKey = SERVICE_PRICE_KEY[service];
      const price = pricing[priceKey];
      if (price === undefined || price === null || price <= 0) {
        Alert.alert(t('common.error'), t('caretaker.noPriceError'));
        return;
      }
    }
    if (accountType === 'business' && !businessName.trim()) {
      Alert.alert(t('common.error'), t('caretaker.businessNameRequired'));
      return;
    }

    setSaving(true);
    try {
      const capacityNum = capacity ? parseInt(capacity, 10) : null;
      const updateData = {
        displayName: displayName.trim(),
        accountType,
        businessName: accountType === 'business' ? businessName.trim() : null,
        capacity: accountType === 'business' && capacityNum && !isNaN(capacityNum) ? capacityNum : null,
        bio: bio.trim(),
        experience: experience.trim(),
        services,
        pricing,
        currency,
        bizumPhone: bizumPhone.trim() || null,
      };
      await updateCaretakerProfile(firebaseUser.uid, updateData);
      setUserData({ ...userData!, ...updateData } as any);
      Alert.alert(t('common.ok'), t('caretaker.profileSaved'));
    } catch (error: any) {
      const errKey = error?.message;
      const errMsg = errKey?.startsWith('caretaker.') || errKey?.startsWith('common.')
        ? t(errKey)
        : t('authErrors.generic');
      Alert.alert(t('common.error'), errMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(t('settings.logout'), t('settings.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.logout'),
        style: 'destructive',
        onPress: async () => { await signOut(); router.replace('/(auth)/login'); },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Verification banner — caretakers MUST verify ID before appearing
            in marketplace. Visible only when not yet verified. */}
        {userData?.verified !== true && (
          <TouchableOpacity
            style={styles.verifyBanner}
            onPress={() => router.push('/(shared)/identity-verification')}
            activeOpacity={0.85}
          >
            <Ionicons name="alert-circle" size={20} color={colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.verifyBannerTitle}>{t('verified.providerNotYetTitle')}</Text>
              <Text style={styles.verifyBannerBody}>{t('verified.providerNotYetBody')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.warning} />
          </TouchableOpacity>
        )}

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <ProfileAvatar
            photoURL={caretaker?.photoURL ?? null}
            name={caretaker?.displayName ?? '?'}
            size={100}
            onPress={handleChangePhoto}
            loading={photoLoading}
          />
        </View>

        {/* Account type selector */}
        <Text style={styles.sectionTitle}>{t('caretaker.accountType')}</Text>
        <View style={styles.accountTypeRow}>
          <TouchableOpacity
            style={[styles.accountCard, accountType === 'individual' && styles.accountCardActive]}
            onPress={() => setAccountType('individual')}
          >
            <Ionicons name="person" size={24} color={accountType === 'individual' ? colors.primary : colors.textLight} />
            <Text style={[styles.accountTitle, accountType === 'individual' && styles.accountTitleActive]}>
              {t('caretaker.individual')}
            </Text>
            <Text style={styles.accountDesc}>{t('caretaker.individualDesc')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.accountCard, accountType === 'business' && styles.accountCardActive]}
            onPress={() => setAccountType('business')}
          >
            <Ionicons name="business" size={24} color={accountType === 'business' ? colors.primary : colors.textLight} />
            <Text style={[styles.accountTitle, accountType === 'business' && styles.accountTitleActive]}>
              {t('caretaker.business')}
            </Text>
            <Text style={styles.accountDesc}>{t('caretaker.businessDesc')}</Text>
          </TouchableOpacity>
        </View>

        {/* Business-only fields */}
        {accountType === 'business' && (
          <>
            <Input
              label={t('caretaker.businessName')}
              value={businessName}
              onChangeText={setBusinessName}
              placeholder={t('caretaker.businessNamePlaceholder')}
            />
            <Input
              label={t('caretaker.capacity')}
              value={capacity}
              onChangeText={setCapacity}
              placeholder={t('caretaker.capacityPlaceholder')}
              keyboardType="number-pad"
            />
          </>
        )}

        {/* Display name */}
        <Input
          label={t('dogs.name')}
          value={displayName}
          onChangeText={setDisplayName}
        />

        {/* Bio */}
        <Input
          label={t('caretaker.bio')}
          value={bio}
          onChangeText={setBio}
          placeholder={t('caretaker.bioPlaceholder')}
          multiline
          numberOfLines={3}
        />

        {/* Experience */}
        <Input
          label={t('caretaker.experience')}
          value={experience}
          onChangeText={setExperience}
          placeholder={t('caretaker.experiencePlaceholder')}
        />

        {/* Services & dynamic pricing */}
        <Text style={styles.sectionTitle}>{t('caretaker.services')}</Text>
        <Text style={styles.helpText}>{t('caretaker.servicesHelp')}</Text>
        <View style={styles.servicesGrid}>
          {ALL_SERVICES.map((service) => {
            const active = services.includes(service);
            return (
              <TouchableOpacity
                key={service}
                style={[styles.serviceChip, active && styles.serviceChipActive]}
                onPress={() => toggleService(service)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={SERVICE_ICONS[service]}
                  size={20}
                  color={active ? '#fff' : colors.textSecondary}
                />
                <Text style={[styles.serviceChipText, active && styles.serviceChipTextActive]}>
                  {t(SERVICE_LABEL_KEY[service])}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Pricing inputs (only for selected services) */}
        {services.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>{t('caretaker.pricing')}</Text>
            {services.map((service) => {
              const priceKey = SERVICE_PRICE_KEY[service];
              const value = pricing[priceKey];
              return (
                <Input
                  key={service}
                  label={`${t(SERVICE_PRICE_LABEL_KEY[service])} (${currency})`}
                  value={value !== undefined && value !== null ? String(value) : ''}
                  onChangeText={(v) => updatePrice(service, v)}
                  keyboardType="decimal-pad"
                />
              );
            })}
            <Input
              label={t('caretaker.currency')}
              value={currency}
              onChangeText={setCurrency}
            />
          </>
        )}

        {/* Location */}
        <Text style={styles.sectionTitle}>{t('caretaker.city')}</Text>
        <Card style={styles.locationCard}>
          {city ? (
            <View style={styles.locationDisplay}>
              <Ionicons name="location" size={20} color={colors.primary} />
              <Text style={styles.locationText}>{city}</Text>
            </View>
          ) : (
            <Text style={styles.locationEmpty}>—</Text>
          )}
          <Button
            title={t('trainer.getLocation')}
            onPress={handleGetLocation}
            loading={locationLoading}
            variant="outline"
          />
        </Card>

        {/* Bizum (off-platform payment) */}
        <Input
          label={t('bookings.bizumLabel')}
          value={bizumPhone}
          onChangeText={setBizumPhone}
          placeholder="+34 6XX XXX XXX"
          keyboardType="phone-pad"
          maxLength={20}
        />
        <Text style={styles.helperText}>{t('bookings.bizumHelper')}</Text>

        {/* Save */}
        <Button
          title={t('caretaker.saveProfile')}
          onPress={handleSave}
          loading={saving}
          size="lg"
        />

        {/* My bookings */}
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => router.push('/(caretaker)/bookings')}
          activeOpacity={0.7}
        >
          <Ionicons name="list-outline" size={20} color={colors.primary} />
          <Text style={styles.settingsText}>{t('bookings.list.title')}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textLight} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>

        {/* My availability */}
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => router.push('/(shared)/availability')}
          activeOpacity={0.7}
        >
          <Ionicons name="calendar-outline" size={20} color={colors.primary} />
          <Text style={styles.settingsText}>{t('bookings.editor.title')}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textLight} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>

        {/* Identity verification */}
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => router.push('/(shared)/identity-verification')}
          activeOpacity={0.7}
        >
          <Ionicons
            name={userData?.verified ? 'shield-checkmark' : 'shield-outline'}
            size={20}
            color={userData?.verified ? colors.success : colors.primary}
          />
          <Text style={styles.settingsText}>
            {userData?.verified
              ? t('identityVerification.entryVerified')
              : t('identityVerification.entry')}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textLight} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>

        {/* Settings (includes Premium / Remove ads) */}
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => router.push('/(shared)/settings')}
          activeOpacity={0.7}
        >
          <Ionicons name="settings-outline" size={20} color={colors.primary} />
          <Text style={styles.settingsText}>{t('settings.title')}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textLight} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  verifyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warning + '15',
    borderWidth: 1,
    borderColor: colors.warning + '40',
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  verifyBannerTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  verifyBannerBody: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  avatarSection: { alignItems: 'center', marginBottom: spacing.lg },
  sectionTitle: {
    fontSize: fontSize.md, fontWeight: '700', color: colors.text,
    marginTop: spacing.md, marginBottom: spacing.xs,
  },
  helpText: {
    fontSize: fontSize.xs, color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  accountTypeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  accountCard: {
    flex: 1, padding: spacing.md, borderRadius: borderRadius.md,
    borderWidth: 2, borderColor: colors.border, alignItems: 'center', gap: 4,
    backgroundColor: colors.background,
  },
  accountCardActive: { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
  accountTitle: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary, textAlign: 'center' },
  accountTitleActive: { color: colors.primary },
  accountDesc: { fontSize: fontSize.xs, color: colors.textLight, textAlign: 'center' },
  servicesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  serviceChip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: borderRadius.full, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.background,
  },
  serviceChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  serviceChipText: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600' },
  serviceChipTextActive: { color: '#fff' },
  locationCard: { gap: spacing.sm, marginBottom: spacing.md },
  locationDisplay: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  locationText: { fontSize: fontSize.md, color: colors.text },
  locationEmpty: { fontSize: fontSize.sm, color: colors.textLight, fontStyle: 'italic' },
  helperText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
    fontStyle: 'italic',
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  settingsText: { fontSize: fontSize.md, color: colors.text, fontWeight: '600' },
});
