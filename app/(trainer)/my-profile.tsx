import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { geohashForLocation } from 'geofire-common';
import { useAuth } from '../../src/contexts/AuthContext';
import { updateTrainerProfile } from '../../src/services/trainers';
import { signOut } from '../../src/services/auth';
import { pickAndUploadImage } from '../../src/utils/photo';
import { Button, Input, Avatar } from '../../src/components/ui';
import { colors, spacing, fontSize, borderRadius } from '../../src/theme';
import { TrainerProfile } from '../../src/types';

export default function TrainerProfileScreen() {
  const { t } = useTranslation();
  const { firebaseUser, userData, setUserData } = useAuth();
  const router = useRouter();
  const trainer = userData as TrainerProfile | null;

  // Form state
  const [displayName, setDisplayName] = useState(trainer?.displayName ?? '');
  const [bio, setBio] = useState(trainer?.bio ?? '');
  const [experience, setExperience] = useState(trainer?.experience ?? '');
  const [pricePerSession, setPricePerSession] = useState(
    trainer?.pricePerSession ? String(trainer.pricePerSession) : ''
  );
  const [currency, setCurrency] = useState(trainer?.currency ?? 'EUR');
  const [city, setCity] = useState(trainer?.city ?? '');
  const [certifications, setCertifications] = useState<string[]>(
    trainer?.certifications ?? []
  );
  const [specialties, setSpecialties] = useState<string[]>(
    trainer?.specialties ?? []
  );
  const [newCert, setNewCert] = useState('');
  const [newSpecialty, setNewSpecialty] = useState('');

  const [saving, setSaving] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);

  const handleSignOut = () => {
    Alert.alert(
      t('settings.logout'),
      '¿Seguro que quieres cerrar sesión?',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.logout'),
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/(auth)/welcome');
          },
        },
      ]
    );
  };

  const handleChangePhoto = async () => {
    if (!firebaseUser) return;
    setPhotoLoading(true);
    try {
      const url = await pickAndUploadImage(`users/${firebaseUser.uid}/avatar.jpg`);
      if (url) {
        await updateTrainerProfile(firebaseUser.uid, { photoURL: url });
        setUserData({ ...userData!, photoURL: url });
      }
    } catch (error) {
      Alert.alert(t('common.error'), t('authErrors.generic'));
    } finally {
      setPhotoLoading(false);
    }
  };

  const handleGetLocation = async () => {
    setLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('common.error'), 'Permiso de ubicación denegado. Actívalo en Ajustes.');
        return;
      }
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = location.coords;
      const geoHash = geohashForLocation([latitude, longitude]);

      // Reverse geocode for city name
      let cityName = '';
      try {
        const [address] = await Location.reverseGeocodeAsync({ latitude, longitude });
        cityName = address?.city || address?.subregion || address?.region || '';
      } catch {
        // Geocoding failed — use coordinates as fallback
        cityName = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
      }

      setCity(cityName);
      if (firebaseUser) {
        await updateTrainerProfile(firebaseUser.uid, {
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
    } catch (error: any) {
      Alert.alert(t('common.error'), error?.message || t('authErrors.generic'));
    } finally {
      setLocationLoading(false);
    }
  };

  const addCertification = () => {
    if (!newCert.trim()) return;
    setCertifications((prev) => [...prev, newCert.trim()]);
    setNewCert('');
  };

  const removeCertification = (index: number) => {
    setCertifications((prev) => prev.filter((_, i) => i !== index));
  };

  const addSpecialty = () => {
    if (!newSpecialty.trim()) return;
    setSpecialties((prev) => [...prev, newSpecialty.trim()]);
    setNewSpecialty('');
  };

  const removeSpecialty = (index: number) => {
    setSpecialties((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!firebaseUser) return;
    setSaving(true);
    try {
      const data = {
        displayName: displayName.trim(),
        bio: bio.trim(),
        experience: experience.trim(),
        pricePerSession: Number(pricePerSession) || 0,
        currency,
        city: city.trim(),
        certifications,
        specialties,
      };
      await updateTrainerProfile(firebaseUser.uid, data);
      setUserData({ ...userData!, ...data } as any);
      Alert.alert(t('common.ok'), t('trainer.profileSaved'));
    } catch (error) {
      Alert.alert(t('common.error'), t('authErrors.generic'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>{t('trainer.myProfile')}</Text>

          {/* Avatar */}
          <TouchableOpacity
            style={styles.avatarSection}
            onPress={handleChangePhoto}
            disabled={photoLoading}
          >
            <Avatar
              uri={userData?.photoURL ?? null}
              name={userData?.displayName ?? '?'}
              size={80}
            />
            <View style={styles.cameraIcon}>
              <Ionicons name="camera" size={16} color={colors.textOnPrimary} />
            </View>
          </TouchableOpacity>

          {/* Basic info */}
          <Input
            label={t('dogs.name')}
            value={displayName}
            onChangeText={setDisplayName}
          />
          <Input
            label={t('trainer.bio')}
            value={bio}
            onChangeText={setBio}
            placeholder={t('trainer.bioPlaceholder')}
            multiline
            numberOfLines={4}
          />
          <Input
            label={t('trainer.experience')}
            value={experience}
            onChangeText={setExperience}
            placeholder="5 years"
          />

          {/* Price & Currency */}
          <View style={styles.row}>
            <View style={{ flex: 2 }}>
              <Input
                label={t('trainer.pricePerSession')}
                value={pricePerSession}
                onChangeText={setPricePerSession}
                keyboardType="numeric"
                placeholder="30"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label={t('trainer.currency')}
                value={currency}
                onChangeText={setCurrency}
                placeholder="EUR"
              />
            </View>
          </View>

          {/* Location */}
          <Text style={styles.sectionLabel}>{t('trainer.city')}</Text>
          <View style={styles.locationRow}>
            <Text style={styles.cityText}>{city || '—'}</Text>
            <Button
              title={t('trainer.getLocation')}
              onPress={handleGetLocation}
              loading={locationLoading}
              variant="outline"
            />
          </View>

          {/* Certifications */}
          <Text style={styles.sectionLabel}>{t('trainer.certifications')}</Text>
          {certifications.map((cert, i) => (
            <View key={i} style={styles.tagRow}>
              <Text style={styles.tagText}>{cert}</Text>
              <TouchableOpacity onPress={() => removeCertification(i)}>
                <Ionicons name="close-circle" size={20} color={colors.error} />
              </TouchableOpacity>
            </View>
          ))}
          <View style={styles.addRow}>
            <View style={{ flex: 1 }}>
              <Input
                value={newCert}
                onChangeText={setNewCert}
                placeholder={t('trainer.addCertification')}
              />
            </View>
            <TouchableOpacity style={styles.addBtn} onPress={addCertification}>
              <Ionicons name="add-circle" size={32} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Specialties */}
          <Text style={styles.sectionLabel}>{t('trainer.specialties')}</Text>
          <View style={styles.chipContainer}>
            {specialties.map((spec, i) => (
              <TouchableOpacity
                key={i}
                style={styles.chip}
                onPress={() => removeSpecialty(i)}
              >
                <Text style={styles.chipText}>{spec}</Text>
                <Ionicons name="close" size={14} color={colors.secondary} />
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.addRow}>
            <View style={{ flex: 1 }}>
              <Input
                value={newSpecialty}
                onChangeText={setNewSpecialty}
                placeholder={t('trainer.addSpecialty')}
              />
            </View>
            <TouchableOpacity style={styles.addBtn} onPress={addSpecialty}>
              <Ionicons name="add-circle" size={32} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Save */}
          <Button
            title={t('common.save')}
            onPress={handleSave}
            loading={saving}
            size="lg"
          />

          {/* Logout */}
          <TouchableOpacity style={styles.logoutButton} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={20} color={colors.error} />
            <Text style={styles.logoutText}>{t('settings.logout')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.lg,
  },
  avatarSection: {
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.primary,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  cityText: {
    fontSize: fontSize.md,
    color: colors.text,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.backgroundSecondary,
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.xs,
  },
  tagText: {
    fontSize: fontSize.sm,
    color: colors.text,
    flex: 1,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  addBtn: {
    paddingTop: spacing.sm,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.secondary + '15',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.secondary + '40',
  },
  chipText: {
    fontSize: fontSize.sm,
    color: colors.secondary,
    fontWeight: '600',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    padding: spacing.md,
  },
  logoutText: {
    fontSize: fontSize.md,
    color: colors.error,
    fontWeight: '600',
  },
});
