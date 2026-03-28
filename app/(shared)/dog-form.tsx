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
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
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

  useEffect(() => {
    navigation.setOptions({
      title: isEditing ? t('dogs.editDog') : t('dogs.addDog'),
    });
  }, [isEditing, t, navigation]);

  // Load existing dog data for editing
  useEffect(() => {
    if (!dogId) return;
    (async () => {
      try {
        const dogDoc = await getDoc(doc(db, 'dogs', dogId));
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
        setInitialLoading(false);
      }
    })();
  }, [dogId]);

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
    if (!name.trim() || !breed.trim()) {
      Alert.alert(t('common.error'), t('authErrors.generic'));
      return;
    }

    const formData: DogFormData = {
      name: name.trim(),
      breed: breed.trim(),
      age: Number(age) || 0,
      weight: Number(weight) || 0,
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
          onChangeText={setName}
          placeholder="Max"
        />
        <Input
          label={t('dogs.breed')}
          value={breed}
          onChangeText={setBreed}
          placeholder="Labrador Retriever"
        />

        {/* Age & Weight row */}
        <View style={styles.row}>
          <View style={styles.halfField}>
            <Input
              label={t('dogs.age')}
              value={age}
              onChangeText={setAge}
              keyboardType="numeric"
              placeholder="3"
            />
          </View>
          <View style={styles.halfField}>
            <Input
              label={t('dogs.weight')}
              value={weight}
              onChangeText={setWeight}
              keyboardType="numeric"
              placeholder="25"
            />
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
          onChangeText={setBehavior}
          placeholder={t('dogs.behavior')}
          multiline
          numberOfLines={3}
        />

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
          disabled={!name.trim() || !breed.trim()}
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
