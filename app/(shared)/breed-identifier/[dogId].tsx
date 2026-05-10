import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../../src/config/firebase';
import { useAuth } from '../../../src/contexts/AuthContext';
import {
  uploadBreedPhoto,
  identifyBreed,
  BREED_AI_COIN_COST,
  BREED_AI_DAILY_LIMIT,
  BreedAiError,
} from '../../../src/services/breedAi';
import { BreedIdentifyResponse } from '../../../src/types';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../../src/theme';

type Step = 'pick' | 'preview' | 'analyzing' | 'result';

export default function BreedIdentifierScreen() {
  const { dogId } = useLocalSearchParams<{ dogId?: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { firebaseUser, userData, setUserData } = useAuth();

  const [step, setStep] = useState<Step>('pick');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [result, setResult] = useState<BreedIdentifyResponse | null>(null);
  const [applying, setApplying] = useState(false);

  const balance = userData?.coinBalance ?? 0;
  const canAfford = balance >= BREED_AI_COIN_COST;

  const pickFromLibrary = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (r.canceled || !r.assets[0]) return;
    setPhotoUri(r.assets[0].uri);
    setStep('preview');
  };
  const pickFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert(t('common.error'), t('breedAi.cameraPermissionDenied'));
      return;
    }
    const r = await ImagePicker.launchCameraAsync({
      allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (r.canceled || !r.assets[0]) return;
    setPhotoUri(r.assets[0].uri);
    setStep('preview');
  };

  const handleIdentify = async () => {
    if (!photoUri || !firebaseUser) return;
    if (!canAfford) {
      Alert.alert(
        t('breedAi.insufficientCoinsTitle'),
        t('breedAi.insufficientCoinsBody', { cost: BREED_AI_COIN_COST }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('breedAi.buyCoins'), onPress: () => router.push('/(shared)/purchase') },
        ],
      );
      return;
    }
    setStep('analyzing');
    try {
      const storagePath = await uploadBreedPhoto(photoUri);
      // Pass the active i18n language so Claude responds in the user's language.
      const r = await identifyBreed(storagePath, dogId, (i18n.language ?? 'es').slice(0, 2));
      setResult(r);
      // Reflect the deducted balance immediately in local state — AuthContext
      // uses one-shot getDoc so without this the UI would show the stale value.
      if (userData && typeof r.newCoinBalance === 'number') {
        setUserData({ ...userData, coinBalance: r.newCoinBalance });
      }
      setStep('result');
    } catch (e: any) {
      const code: BreedAiError = (e?.message ?? 'unknown') as BreedAiError;
      const msgKey = `breedAi.errors.${code}`;
      Alert.alert(t('common.error'), t(msgKey, { defaultValue: t('breedAi.errors.unknown') }));
      setStep('preview');
    }
  };

  const handleApplyBreed = async () => {
    if (!result || !dogId) return;
    setApplying(true);
    try {
      await updateDoc(doc(db, 'dogs', dogId), {
        breed: result.breed,
        updatedAt: Timestamp.now(),
      });
      Alert.alert(t('breedAi.appliedTitle'), t('breedAi.appliedBody', { breed: result.breed }), [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message ?? '');
    } finally {
      setApplying(false);
    }
  };

  const reset = () => {
    setPhotoUri(null);
    setResult(null);
    setStep('pick');
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: t('breedAi.title') }} />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Header explainer */}
        <View style={styles.header}>
          <View style={styles.aiBadge}>
            <Ionicons name="sparkles" size={14} color={colors.primary} />
            <Text style={styles.aiBadgeText}>AI</Text>
          </View>
          <Text style={styles.title}>{t('breedAi.heading')}</Text>
          <Text style={styles.subtitle}>{t('breedAi.subtitle')}</Text>
        </View>

        {/* Cost row */}
        <View style={styles.costRow}>
          <Ionicons name="logo-bitcoin" size={16} color={colors.primary} />
          <Text style={styles.costText}>
            {t('breedAi.cost', { cost: BREED_AI_COIN_COST })}
          </Text>
          <Text style={styles.balanceText}>· {t('breedAi.balance', { balance })}</Text>
        </View>
        <Text style={styles.dailyLimitText}>
          {t('breedAi.dailyLimit', { limit: BREED_AI_DAILY_LIMIT })}
        </Text>

        {/* Step content */}
        {step === 'pick' && (
          <View style={styles.pickerBlock}>
            <TouchableOpacity style={styles.pickerBtn} onPress={pickFromCamera}>
              <Ionicons name="camera" size={28} color={colors.primary} />
              <Text style={styles.pickerLabel}>{t('breedAi.takePhoto')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.pickerBtn} onPress={pickFromLibrary}>
              <Ionicons name="images" size={28} color={colors.primary} />
              <Text style={styles.pickerLabel}>{t('breedAi.fromLibrary')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'preview' && photoUri && (
          <>
            <Image source={{ uri: photoUri }} style={styles.photoPreview} />
            <View style={styles.actionsRow}>
              <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={reset}>
                <Text style={[styles.btnText, styles.btnSecondaryText]}>{t('breedAi.changePhoto')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={handleIdentify}>
                <Ionicons name="sparkles" size={18} color={colors.textOnPrimary} />
                <Text style={styles.btnText}>{t('breedAi.identify')}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {step === 'analyzing' && photoUri && (
          <>
            <Image source={{ uri: photoUri }} style={styles.photoPreview} />
            <View style={styles.analyzingBox}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={styles.analyzingText}>{t('breedAi.analyzing')}</Text>
              <Text style={styles.analyzingHint}>{t('breedAi.analyzingHint')}</Text>
            </View>
          </>
        )}

        {step === 'result' && result && photoUri && (
          <>
            <Image source={{ uri: photoUri }} style={styles.photoPreview} />

            {result.breed === 'no_dog' ? (
              <View style={styles.noDogCard}>
                <Ionicons name="alert-circle" size={36} color={colors.warning} />
                <Text style={styles.noDogTitle}>{t('breedAi.noDogTitle')}</Text>
                <Text style={styles.noDogBody}>{t('breedAi.noDogBody')}</Text>
              </View>
            ) : (
              <>
                {/* Top breed */}
                <View style={styles.resultCard}>
                  <Text style={styles.resultLabel}>{t('breedAi.mostLikely')}</Text>
                  <Text style={styles.resultBreed}>{result.breed}</Text>
                  <ConfidenceBar value={result.confidence} />
                  <Text style={styles.confidenceText}>
                    {t('breedAi.confidence', { pct: Math.round(result.confidence * 100) })}
                  </Text>
                </View>

                {/* Alternates */}
                {result.alternates.length > 0 && (
                  <View style={styles.altCard}>
                    <Text style={styles.sectionTitle}>{t('breedAi.alternates')}</Text>
                    {result.alternates.map((a, idx) => (
                      <View key={idx} style={styles.altRow}>
                        <Text style={styles.altName}>{a.name}</Text>
                        <Text style={styles.altPct}>{Math.round(a.probability * 100)}%</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Temperament + Care tips */}
                {result.temperament ? (
                  <View style={styles.infoCard}>
                    <Text style={styles.sectionTitle}>{t('breedAi.temperament')}</Text>
                    <Text style={styles.infoBody}>{result.temperament}</Text>
                  </View>
                ) : null}
                {result.careTips ? (
                  <View style={styles.infoCard}>
                    <Text style={styles.sectionTitle}>{t('breedAi.careTips')}</Text>
                    <Text style={styles.infoBody}>{result.careTips}</Text>
                  </View>
                ) : null}
                {result.notes ? (
                  <View style={styles.notesBox}>
                    <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
                    <Text style={styles.notesText}>{result.notes}</Text>
                  </View>
                ) : null}

                {/* Apply / Retry */}
                <View style={styles.actionsRow}>
                  <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={reset}>
                    <Text style={[styles.btnText, styles.btnSecondaryText]}>{t('breedAi.tryAnother')}</Text>
                  </TouchableOpacity>
                  {dogId && (
                    <TouchableOpacity
                      style={[styles.btn, styles.btnPrimary]}
                      onPress={handleApplyBreed}
                      disabled={applying}
                    >
                      {applying
                        ? <ActivityIndicator color={colors.textOnPrimary} />
                        : (
                          <>
                            <Ionicons name="checkmark" size={18} color={colors.textOnPrimary} />
                            <Text style={styles.btnText}>{t('breedAi.applyBreed')}</Text>
                          </>
                        )}
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </>
        )}

        <Text style={styles.disclaimer}>{t('breedAi.disclaimer')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const color = value >= 0.8 ? '#27AE60' : value >= 0.6 ? colors.primary : colors.warning;
  return (
    <View style={styles.confBg}>
      <View style={[styles.confFill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },

  header: { alignItems: 'center', gap: 6 },
  aiBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary + '15',
  },
  aiBadgeText: { color: colors.primary, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 0.5 },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text, textAlign: 'center' },
  subtitle: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },

  costRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  costText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '700' },
  balanceText: { fontSize: fontSize.sm, color: colors.textSecondary },
  dailyLimitText: { fontSize: fontSize.xs, color: colors.textLight, textAlign: 'center', marginTop: -8 },

  pickerBlock: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  pickerBtn: {
    flex: 1, padding: spacing.lg, alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    borderWidth: 1, borderColor: colors.border,
    ...shadow.sm,
  },
  pickerLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },

  photoPreview: {
    width: '100%', aspectRatio: 1,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background,
  },

  analyzingBox: { alignItems: 'center', gap: spacing.sm, padding: spacing.lg },
  analyzingText: { fontSize: fontSize.md, fontWeight: '800', color: colors.text },
  analyzingHint: { fontSize: fontSize.xs, color: colors.textSecondary, textAlign: 'center' },

  resultCard: {
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    ...shadow.sm,
    gap: 6,
  },
  resultLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  resultBreed: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.text },
  confBg: { height: 8, borderRadius: 4, backgroundColor: colors.backgroundSecondary, overflow: 'hidden', marginTop: 6 },
  confFill: { height: '100%', borderRadius: 4 },
  confidenceText: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '600' },

  altCard: {
    backgroundColor: colors.background, padding: spacing.md, borderRadius: borderRadius.lg, ...shadow.sm,
  },
  altRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  altName: { fontSize: fontSize.sm, color: colors.text },
  altPct: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '700' },

  infoCard: {
    backgroundColor: colors.background, padding: spacing.md, borderRadius: borderRadius.lg, ...shadow.sm, gap: 4,
  },
  sectionTitle: {
    fontSize: 10, color: colors.textSecondary, fontWeight: '800',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
  },
  infoBody: { fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },

  notesBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    padding: spacing.sm, backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
  },
  notesText: { flex: 1, fontSize: fontSize.xs, color: colors.textSecondary },

  noDogCard: {
    alignItems: 'center', gap: spacing.sm, padding: spacing.lg,
    backgroundColor: colors.warning + '10',
    borderRadius: borderRadius.lg,
  },
  noDogTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.text },
  noDogBody: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },

  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: spacing.md, borderRadius: borderRadius.full,
  },
  btnPrimary: { backgroundColor: colors.primary },
  btnSecondary: { backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.primary },
  btnSecondaryText: { color: colors.primary },
  btnText: { color: colors.textOnPrimary, fontWeight: '800', fontSize: fontSize.md },

  disclaimer: {
    fontSize: fontSize.xs, color: colors.textLight, textAlign: 'center',
    fontStyle: 'italic', marginTop: spacing.md,
  },
});
