import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../src/contexts/AuthContext';
import {
  submitIdVerification,
  getMyIdVerification,
} from '../../src/services/idVerification';
import { IdDocumentType, IdVerification } from '../../src/types';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../src/theme';

const DOC_TYPES: IdDocumentType[] = ['dni', 'passport', 'driver_license'];

export default function IdentityVerificationScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { firebaseUser, userData } = useAuth();

  const [docType, setDocType] = useState<IdDocumentType>('dni');
  const [front, setFront] = useState<string | null>(null);
  const [back, setBack] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [existing, setExisting] = useState<IdVerification | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!firebaseUser) { setLoading(false); return; }
      let cancelled = false;
      (async () => {
        try {
          const v = await getMyIdVerification(firebaseUser.uid);
          if (!cancelled) setExisting(v);
        } catch (e) {
          console.error('Error loading verification', e);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => { cancelled = true; };
    }, [firebaseUser?.uid])
  );

  const pickImage = async (
    setter: (uri: string) => void,
    aspect: [number, number] = [4, 3],
  ) => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect,
      quality: 0.7,
    });
    if (r.canceled || !r.assets[0]) return;
    setter(r.assets[0].uri);
  };

  const takeSelfie = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert(t('common.error'), t('identityVerification.cameraDenied'));
      return;
    }
    const r = await ImagePicker.launchCameraAsync({
      cameraType: ImagePicker.CameraType.front,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (r.canceled || !r.assets[0]) return;
    setSelfie(r.assets[0].uri);
  };

  const handleSubmit = async () => {
    if (!firebaseUser) return;
    if (!front) { Alert.alert(t('common.error'), t('identityVerification.errors.frontMissing')); return; }
    if (!selfie) { Alert.alert(t('common.error'), t('identityVerification.errors.selfieMissing')); return; }
    if (docType !== 'passport' && !back) {
      Alert.alert(t('common.error'), t('identityVerification.errors.backMissing'));
      return;
    }

    setSubmitting(true);
    try {
      const v = await submitIdVerification({
        userId: firebaseUser.uid,
        documentType: docType,
        frontUri: front,
        backUri: docType !== 'passport' ? (back ?? undefined) : undefined,
        selfieUri: selfie,
      });
      setExisting(v);
      Alert.alert(
        t('identityVerification.submittedTitle'),
        t('identityVerification.submittedBody'),
      );
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message ?? t('identityVerification.errors.unknown'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={styles.loader} color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  // Show status banner if user already has a verification record.
  const showSubmitForm =
    !existing
    || existing.status === 'rejected'  // allow re-submit after rejection
    || (existing.status === 'verified' && userData?.verified === false);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: t('identityVerification.title') }} />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

        {/* Status banner */}
        {existing && existing.status === 'pending' && (
          <View style={[styles.statusCard, styles.statusPending]}>
            <Ionicons name="time" size={24} color={colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>{t('identityVerification.statusPendingTitle')}</Text>
              <Text style={styles.statusBody}>{t('identityVerification.statusPendingBody')}</Text>
            </View>
          </View>
        )}
        {existing && existing.status === 'verified' && userData?.verified && (
          <View style={[styles.statusCard, styles.statusVerified]}>
            <Ionicons name="shield-checkmark" size={24} color={colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>{t('identityVerification.statusVerifiedTitle')}</Text>
              <Text style={styles.statusBody}>{t('identityVerification.statusVerifiedBody')}</Text>
            </View>
          </View>
        )}
        {existing && existing.status === 'rejected' && (
          <View style={[styles.statusCard, styles.statusRejected]}>
            <Ionicons name="close-circle" size={24} color={colors.error} />
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>{t('identityVerification.statusRejectedTitle')}</Text>
              <Text style={styles.statusBody}>
                {existing.rejectionReason
                  ? t('identityVerification.statusRejectedBodyWithReason', { reason: existing.rejectionReason })
                  : t('identityVerification.statusRejectedBody')}
              </Text>
            </View>
          </View>
        )}

        {showSubmitForm && (
          <>
            <Text style={styles.heading}>{t('identityVerification.heading')}</Text>
            <Text style={styles.subtitle}>{t('identityVerification.subtitle')}</Text>

            {/* Doc type selector */}
            <Text style={styles.sectionTitle}>{t('identityVerification.docTypeLabel')}</Text>
            <View style={styles.docTypeRow}>
              {DOC_TYPES.map((dt) => {
                const active = docType === dt;
                return (
                  <TouchableOpacity
                    key={dt}
                    style={[styles.docTypeBtn, active && styles.docTypeBtnActive]}
                    onPress={() => setDocType(dt)}
                  >
                    <Text style={[styles.docTypeText, active && styles.docTypeTextActive]}>
                      {t(`identityVerification.docTypes.${dt}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Front */}
            <Text style={styles.sectionTitle}>
              {docType === 'passport'
                ? t('identityVerification.passportPage')
                : t('identityVerification.frontLabel')}
            </Text>
            <PhotoSlot
              uri={front}
              onPick={() => pickImage(setFront, [16, 10])}
              hint={t('identityVerification.frontHint')}
            />

            {/* Back (skip for passport) */}
            {docType !== 'passport' && (
              <>
                <Text style={styles.sectionTitle}>{t('identityVerification.backLabel')}</Text>
                <PhotoSlot
                  uri={back}
                  onPick={() => pickImage(setBack!, [16, 10])}
                  hint={t('identityVerification.backHint')}
                />
              </>
            )}

            {/* Selfie */}
            <Text style={styles.sectionTitle}>{t('identityVerification.selfieLabel')}</Text>
            <PhotoSlot
              uri={selfie}
              onPick={takeSelfie}
              hint={t('identityVerification.selfieHint')}
              square
              actionLabel={t('identityVerification.openCamera')}
              actionIcon="camera"
            />

            {/* GDPR consent text */}
            <View style={styles.gdprBox}>
              <Ionicons name="lock-closed" size={14} color={colors.textSecondary} />
              <Text style={styles.gdprText}>{t('identityVerification.gdprNotice')}</Text>
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting
                ? <ActivityIndicator color="#fff" />
                : (
                  <>
                    <Ionicons name="shield-checkmark" size={18} color="#fff" />
                    <Text style={styles.submitBtnText}>{t('identityVerification.submitCta')}</Text>
                  </>
                )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function PhotoSlot({
  uri,
  onPick,
  hint,
  square,
  actionLabel,
  actionIcon,
}: {
  uri: string | null;
  onPick: () => void;
  hint: string;
  square?: boolean;
  actionLabel?: string;
  actionIcon?: any;
}) {
  return (
    <TouchableOpacity
      style={[
        photoSlotStyles.box,
        square ? photoSlotStyles.boxSquare : photoSlotStyles.boxWide,
      ]}
      onPress={onPick}
      activeOpacity={0.85}
    >
      {uri ? (
        <Image source={{ uri }} style={photoSlotStyles.image} resizeMode="cover" />
      ) : (
        <View style={photoSlotStyles.placeholder}>
          <Ionicons name={actionIcon ?? 'image-outline'} size={28} color={colors.textLight} />
          <Text style={photoSlotStyles.actionLabel}>{actionLabel ?? 'Toca para subir'}</Text>
          <Text style={photoSlotStyles.hint}>{hint}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const photoSlotStyles = StyleSheet.create({
  box: {
    width: '100%',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  boxWide: { aspectRatio: 16 / 10 },
  boxSquare: { aspectRatio: 1 },
  image: { width: '100%', height: '100%' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.md, gap: 4 },
  actionLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text, marginTop: 6 },
  hint: { fontSize: fontSize.xs, color: colors.textSecondary, textAlign: 'center' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  loader: { flex: 1 },
  body: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },

  statusCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md, borderRadius: borderRadius.lg,
    borderWidth: 1, marginBottom: spacing.md,
  },
  statusPending: { backgroundColor: colors.warning + '15', borderColor: colors.warning + '40' },
  statusVerified: { backgroundColor: colors.success + '15', borderColor: colors.success + '40' },
  statusRejected: { backgroundColor: colors.error + '15', borderColor: colors.error + '40' },
  statusTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.text },
  statusBody: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },

  heading: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.sm },

  sectionTitle: {
    fontSize: 10, fontWeight: '800', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: spacing.md, marginBottom: 6,
  },

  docTypeRow: { flexDirection: 'row', gap: spacing.xs },
  docTypeBtn: {
    flex: 1, paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center',
  },
  docTypeBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  docTypeText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textSecondary },
  docTypeTextActive: { color: colors.textOnPrimary },

  gdprBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    padding: spacing.sm, marginTop: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundSecondary,
  },
  gdprText: { flex: 1, fontSize: fontSize.xs, color: colors.textSecondary, lineHeight: 16 },

  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.md, borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    marginTop: spacing.md,
    ...shadow.md,
  },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: '#fff', fontWeight: '800', fontSize: fontSize.md },
});
