import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  Image,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams, useNavigation, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import { useAuth } from '../../src/contexts/AuthContext';
import { createDog, updateDog, DogFormData } from '../../src/services/dogs';
import { pickAndUploadImage } from '../../src/utils/photo';
import { Button, Input } from '../../src/components/ui';
import { colors, spacing, fontSize, borderRadius } from '../../src/theme';
import { Dog, DogSex, DogIssue } from '../../src/types';

const ALL_ISSUES: DogIssue[] = [
  'aggression', 'anxiety', 'barking', 'pulling', 'fearful', 'destructive', 'other',
];

export default function DogFormScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const { firebaseUser } = useAuth();
  const { dogId } = useLocalSearchParams<{ dogId?: string }>();
  const isEditing = !!dogId;

  const [loading, setLoading] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEditing);

  // Form fields
  const [name, setName] = useState('');
  const [breed, setBreed] = useState('');
  const [age, setAge] = useState('');
  const [weight, setWeight] = useState('');
  const [sex, setSex] = useState<DogSex>('male');
  const [behavior, setBehavior] = useState('');
  const [issues, setIssues] = useState<DogIssue[]>([]);
  const [photoURL, setPhotoURL] = useState<string | null>(null);

  // Field-level errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    const trimName = name.trim();
    const trimBreed = breed.trim();
    const trimBehavior = behavior.trim();
    const ageNum = Number(age);
    const weightNum = Number(weight);

    if (!trimName) newErrors.name = t('dogs.validation.nameRequired');
    else if (trimName.length < 2) newErrors.name = t('dogs.validation.nameTooShort');
    else if (trimName.length > 40) newErrors.name = t('dogs.validation.nameTooLong');

    if (!trimBreed) newErrors.breed = t('dogs.validation.breedRequired');
    else if (trimBreed.length < 2) newErrors.breed = t('dogs.validation.breedTooShort');
    else if (trimBreed.length > 50) newErrors.breed = t('dogs.validation.breedTooLong');

    if (age === '') newErrors.age = t('dogs.validation.ageRequired');
    else if (!Number.isInteger(ageNum) || ageNum < 0 || ageNum > 30) newErrors.age = t('dogs.validation.ageInvalid');

    if (weight === '') newErrors.weight = t('dogs.validation.weightRequired');
    else if (isNaN(weightNum) || weightNum < 0.5 || weightNum > 120) newErrors.weight = t('dogs.validation.weightInvalid');

    if (trimBehavior.length > 300) newErrors.behavior = t('dogs.validation.behaviorTooLong');

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  useEffect(() => {
    navigation.setOptions({
      title: isEditing ? t('dogs.editDog') : t('dogs.addDog'),
    });
  }, [isEditing, t, navigation]);

  // Load (or reload) the dog whenever the screen gains focus. This ensures
  // changes made in nested screens (e.g. AI breed identifier applies a new
  // breed) are reflected when the user returns here, since the form keeps
  // its state in plain useState (no Firestore listener).
  useFocusEffect(
    React.useCallback(() => {
      if (!dogId) { setInitialLoading(false); return; }
      let cancelled = false;
      (async () => {
        try {
          const dogDoc = await getDoc(doc(db, 'dogs', dogId));
          if (cancelled) return;
          if (dogDoc.exists()) {
            const data = dogDoc.data() as Omit<Dog, 'id'>;
            setName(data.name);
            setBreed(data.breed);
            setAge(String(data.age));
            setWeight(String(data.weight));
            setSex(data.sex);
            setBehavior(data.behavior);
            setIssues(data.issues);
            setPhotoURL(data.photoURL);
          }
        } catch (error) {
          console.error('Error loading dog:', error);
        } finally {
          if (!cancelled) setInitialLoading(false);
        }
      })();
      return () => { cancelled = true; };
    }, [dogId])
  );

  const toggleIssue = (issue: DogIssue) => {
    setIssues((prev) =>
      prev.includes(issue) ? prev.filter((i) => i !== issue) : [...prev, issue]
    );
  };

  const handlePickPhoto = async () => {
    if (!firebaseUser) return;
    setPhotoLoading(true);
    try {
      const id = dogId || `new_${Date.now()}`;
      const url = await pickAndUploadImage(`dogs/${firebaseUser.uid}/${id}.jpg`);
      if (url) setPhotoURL(url);
    } catch (error) {
      Alert.alert(t('common.error'), t('authErrors.generic'));
    } finally {
      setPhotoLoading(false);
    }
  };

  const handleSave = async () => {
    if (!firebaseUser) return;
    if (!validate()) return;

    const formData: DogFormData = {
      name: name.trim(),
      breed: breed.trim(),
      age: Number(age),
      weight: Number(weight),
      sex,
      behavior: behavior.trim(),
      issues,
      photoURL,
    };

    setLoading(true);
    try {
      if (isEditing && dogId) {
        await updateDog(dogId, formData);
      } else {
        await createDog(firebaseUser.uid, formData);
      }
      router.back();
    } catch (error) {
      Alert.alert(t('common.error'), t('authErrors.generic'));
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.textSecondary }}>{t('common.loading')}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Photo */}
        <TouchableOpacity style={styles.photoSection} onPress={handlePickPhoto} disabled={photoLoading}>
          {photoURL ? (
            <Image source={{ uri: photoURL }} style={styles.photo} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Ionicons name="camera-outline" size={36} color={colors.textLight} />
              <Text style={styles.photoText}>
                {photoLoading ? t('common.loading') : t('dogs.addPhoto')}
              </Text>
            </View>
          )}
          {photoURL && (
            <Text style={styles.changePhotoText}>{t('dogs.changePhoto')}</Text>
          )}
        </TouchableOpacity>

        {/* Name & Breed */}
        <Input
          label={t('dogs.name')}
          value={name}
          onChangeText={(v) => { setName(v); setErrors((e) => ({ ...e, name: '' })); }}
          placeholder="Max"
          maxLength={40}
        />
        {!!errors.name && <Text style={styles.errorText}>{errors.name}</Text>}

        <Input
          label={t('dogs.breed')}
          value={breed}
          onChangeText={(v) => { setBreed(v); setErrors((e) => ({ ...e, breed: '' })); }}
          placeholder="Labrador Retriever"
          maxLength={50}
        />
        {!!errors.breed && <Text style={styles.errorText}>{errors.breed}</Text>}
        {isEditing && dogId ? (
          <TouchableOpacity
            style={styles.aiBreedBtn}
            onPress={() => router.push(`/(shared)/breed-identifier/${dogId}`)}
            activeOpacity={0.85}
          >
            <Ionicons name="sparkles" size={14} color={colors.primary} />
            <Text style={styles.aiBreedBtnText}>{t('breedAi.identifyCta')}</Text>
          </TouchableOpacity>
        ) : (
          // Create flow: dogId doesn't exist yet, so the breed-identifier
          // screen has nothing to attach the result to. Show a hint instead
          // so the user knows the feature exists and is unlocked after save.
          <View style={styles.aiBreedHint}>
            <Ionicons name="sparkles" size={14} color={colors.textSecondary} />
            <Text style={styles.aiBreedHintText}>{t('breedAi.identifyHintOnCreate')}</Text>
          </View>
        )}

        {/* Age & Weight row */}
        <View style={styles.row}>
          <View style={styles.halfField}>
            <Input
              label={t('dogs.age')}
              value={age}
              onChangeText={(v) => { setAge(v); setErrors((e) => ({ ...e, age: '' })); }}
              keyboardType="numeric"
              placeholder="3"
              maxLength={2}
            />
            {!!errors.age && <Text style={styles.errorText}>{errors.age}</Text>}
          </View>
          <View style={styles.halfField}>
            <Input
              label={t('dogs.weight')}
              value={weight}
              onChangeText={(v) => { setWeight(v); setErrors((e) => ({ ...e, weight: '' })); }}
              keyboardType="decimal-pad"
              placeholder="25"
              maxLength={5}
            />
            {!!errors.weight && <Text style={styles.errorText}>{errors.weight}</Text>}
          </View>
        </View>

        {/* Sex */}
        <Text style={styles.label}>{t('dogs.sex')}</Text>
        <View style={styles.sexRow}>
          <TouchableOpacity
            style={[styles.sexOption, sex === 'male' && styles.sexOptionSelected]}
            onPress={() => setSex('male')}
          >
            <Ionicons
              name="male"
              size={20}
              color={sex === 'male' ? colors.textOnPrimary : colors.text}
            />
            <Text style={[styles.sexText, sex === 'male' && styles.sexTextSelected]}>
              {t('dogs.male')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sexOption, sex === 'female' && styles.sexOptionSelected]}
            onPress={() => setSex('female')}
          >
            <Ionicons
              name="female"
              size={20}
              color={sex === 'female' ? colors.textOnPrimary : colors.text}
            />
            <Text style={[styles.sexText, sex === 'female' && styles.sexTextSelected]}>
              {t('dogs.female')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Behavior */}
        <Input
          label={t('dogs.behavior')}
          value={behavior}
          onChangeText={(v) => { setBehavior(v); setErrors((e) => ({ ...e, behavior: '' })); }}
          placeholder={t('dogs.behavior')}
          multiline
          numberOfLines={3}
          maxLength={300}
        />
        {!!errors.behavior && <Text style={styles.errorText}>{errors.behavior}</Text>}

        {/* Issues */}
        <Text style={styles.label}>{t('dogs.issues')}</Text>
        <View style={styles.issuesGrid}>
          {ALL_ISSUES.map((issue) => {
            const selected = issues.includes(issue);
            return (
              <TouchableOpacity
                key={issue}
                style={[styles.issueChip, selected && styles.issueChipSelected]}
                onPress={() => toggleIssue(issue)}
              >
                <Text style={[styles.issueChipText, selected && styles.issueChipTextSelected]}>
                  {t(`dogs.issueOptions.${issue}`)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Save */}
        <Button
          title={isEditing ? t('common.save') : t('dogs.addDog')}
          onPress={handleSave}
          loading={loading}
          size="lg"
          disabled={loading}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  photoSection: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  photo: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  photoPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  photoText: {
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: spacing.xs,
  },
  changePhotoText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    marginTop: spacing.sm,
    fontWeight: '600',
  },
  errorText: {
    fontSize: fontSize.xs,
    color: colors.error,
    marginTop: -spacing.sm,
    marginBottom: spacing.sm,
    marginLeft: 2,
  },
  aiBreedBtn: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary + '15',
    marginTop: -spacing.sm,
    marginBottom: spacing.sm,
  },
  aiBreedBtnText: { color: colors.primary, fontSize: fontSize.xs, fontWeight: '700' },
  aiBreedHint: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: -spacing.sm,
    marginBottom: spacing.sm,
  },
  aiBreedHintText: { color: colors.textSecondary, fontSize: fontSize.xs, fontStyle: 'italic', flex: 1 },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  halfField: {
    flex: 1,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  sexRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  sexOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
  },
  sexOptionSelected: {
    borderColor: colors.secondary,
    backgroundColor: colors.secondary,
  },
  sexText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  sexTextSelected: {
    color: colors.textOnPrimary,
  },
  issuesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  issueChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
  },
  issueChipSelected: {
    borderColor: colors.warning,
    backgroundColor: colors.warning + '20',
  },
  issueChipText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  issueChipTextSelected: {
    color: colors.warning,
    fontWeight: '600',
  },
});
