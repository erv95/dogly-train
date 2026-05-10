import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  getAvailability,
  setWeeklyAvailability,
  defaultWeeklyAvailability,
  invalidateAvailabilityCache,
} from '../../src/services/availability';
import {
  WeeklyAvailability,
  WeeklyAvailabilityDay,
} from '../../src/types';
import { useAuth } from '../../src/contexts/AuthContext';
import AvailabilityWeekEditor from '../../src/components/AvailabilityWeekEditor';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../src/theme';

export default function AvailabilityScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { firebaseUser, userData } = useAuth();
  const [availability, setAvailability] = useState<WeeklyAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const isProvider = userData?.role === 'trainer' || userData?.role === 'caretaker';

  useFocusEffect(
    useCallback(() => {
      if (!firebaseUser || !isProvider) { setLoading(false); return; }
      let cancelled = false;
      (async () => {
        try {
          invalidateAvailabilityCache(firebaseUser.uid);
          const a = await getAvailability(firebaseUser.uid);
          if (!cancelled) {
            setAvailability(a ?? defaultWeeklyAvailability(firebaseUser.uid));
            setDirty(false);
          }
        } catch (e) {
          console.error('loadAvailability', e);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => { cancelled = true; };
    }, [firebaseUser?.uid, isProvider])
  );

  const handleChangeWeekly = (next: WeeklyAvailabilityDay[]) => {
    if (!availability) return;
    setAvailability({ ...availability, weekly: next });
    setDirty(true);
  };

  const handleSave = async () => {
    if (!firebaseUser || !availability) return;
    setSaving(true);
    try {
      await setWeeklyAvailability(firebaseUser.uid, availability.weekly, {
        minLeadMinutes: availability.minLeadMinutes,
        maxHorizonDays: availability.maxHorizonDays,
      });
      setDirty(false);
      Alert.alert(t('common.ok'), t('bookings.editor.saved'));
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message ?? '');
    } finally {
      setSaving(false);
    }
  };

  if (!isProvider) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.empty}>
          <Ionicons name="lock-closed-outline" size={48} color={colors.textLight} />
          <Text style={styles.emptyText}>{t('bookings.editor.providersOnly')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={styles.loader} color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: t('bookings.editor.title') }} />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>{t('bookings.editor.intro')}</Text>

        {/* Bizum reminder banner */}
        {!userData?.bizumPhone && (
          <View style={styles.bizumBanner}>
            <Ionicons name="cash-outline" size={18} color={colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.bizumBannerTitle}>{t('bookings.editor.bizumWarningTitle')}</Text>
              <Text style={styles.bizumBannerBody}>{t('bookings.editor.bizumWarningBody')}</Text>
            </View>
            <TouchableOpacity onPress={() => router.push(userData?.role === 'trainer' ? '/(trainer)/my-profile' : '/(caretaker)/my-profile')}>
              <Text style={styles.bizumBannerCta}>{t('bookings.editor.bizumWarningCta')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {availability && (
          <AvailabilityWeekEditor
            weekly={availability.weekly}
            onChange={handleChangeWeekly}
          />
        )}

        <Text style={styles.footHint}>{t('bookings.editor.tapChipToRemove')}</Text>

        {dirty && (
          <View style={styles.saveBar}>
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color={colors.textOnPrimary} />
                : (
                  <>
                    <Ionicons name="checkmark" size={18} color={colors.textOnPrimary} />
                    <Text style={styles.saveBtnText}>{t('bookings.editor.saveChanges')}</Text>
                  </>
                )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  loader: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyText: { color: colors.textSecondary, fontSize: fontSize.md, textAlign: 'center', paddingHorizontal: spacing.lg },
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  intro: { fontSize: fontSize.sm, color: colors.textSecondary },

  bizumBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.warning + '15',
    borderColor: colors.warning + '40',
    borderWidth: 1,
    borderRadius: borderRadius.md,
  },
  bizumBannerTitle: { fontSize: fontSize.sm, fontWeight: '800', color: colors.text },
  bizumBannerBody: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  bizumBannerCta: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '800' },

  footHint: {
    fontSize: fontSize.xs, color: colors.textLight,
    textAlign: 'center', marginTop: spacing.sm,
  },
  saveBar: {
    marginTop: spacing.lg,
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: spacing.md, borderRadius: borderRadius.full,
    backgroundColor: colors.primary, ...shadow.md,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: colors.textOnPrimary, fontWeight: '800', fontSize: fontSize.md },
});
