import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  Linking,
  AppState,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '../../src/config/i18n';
import { signOut } from '../../src/services/auth';
import { auth, db } from '../../src/config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { updateUserProfile } from '../../src/services/users';
import {
  createPremiumCheckoutStripe,
  createPremiumOrderPaypal,
  AlreadyPremiumError,
} from '../../src/services/premium';
import { useAuth } from '../../src/contexts/AuthContext';
import { colors, spacing, fontSize, borderRadius, PREMIUM_PRICE_EUR } from '../../src/theme';
import { User } from '../../src/types';

const LANGUAGES = [
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'pt', label: 'Português', flag: '🇵🇹' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
];

function SettingsRow({
  icon,
  label,
  onPress,
  value,
  danger = false,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  value?: string;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.rowIconBox, danger && styles.rowIconBoxDanger]}>
        <Ionicons
          name={icon as any}
          size={20}
          color={danger ? colors.error : colors.primary}
        />
      </View>
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
      <View style={styles.rowRight}>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
        <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
      </View>
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { firebaseUser, userData, setUserData } = useAuth();
  const [showLangModal, setShowLangModal] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [premiumLoading, setPremiumLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isPremium = userData?.isPremium === true;

  const currentLang = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0];

  const handleLanguageChange = async (code: string) => {
    i18n.changeLanguage(code);
    setShowLangModal(false);
    await AsyncStorage.setItem('@dogly_language', code);
    if (firebaseUser) {
      try {
        await updateUserProfile(firebaseUser.uid, { language: code });
        setUserData({ ...userData!, language: code });
      } catch (e) {
        // Non-critical — language already changed in i18n
      }
    }
  };

  // After returning from external checkout (browser → app), the webhook may
  // have already activated premium server-side. Refresh user data on app foreground.
  const wasInBackgroundForPremium = useRef(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' && premiumLoading) {
        wasInBackgroundForPremium.current = true;
      }
      if (state === 'active' && wasInBackgroundForPremium.current) {
        wasInBackgroundForPremium.current = false;
        refreshUserData();
        setPremiumLoading(false);
      }
    });
    return () => sub.remove();
  }, [premiumLoading]);

  // Refresh user data from server (used after returning from external checkout)
  const refreshUserData = async () => {
    if (!firebaseUser) return;
    try {
      const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (snap.exists()) {
        setUserData({ id: snap.id, ...snap.data() } as User);
      }
    } catch {
      // Silent — UI will reflect on next reload
    }
  };

  const handleBuyPremium = async (method: 'stripe' | 'paypal') => {
    if (!firebaseUser) return;
    setShowPremiumModal(false);
    setPremiumLoading(true);
    try {
      const url = method === 'stripe'
        ? await createPremiumCheckoutStripe(firebaseUser.uid)
        : await createPremiumOrderPaypal(firebaseUser.uid);
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert(t('common.error'), t('authErrors.generic'));
      }
    } catch (err: any) {
      if (err instanceof AlreadyPremiumError) {
        Alert.alert(t('premium.alreadyActive'), t('premium.alreadyActiveDesc'));
        // Sync state in case it changed elsewhere
        refreshUserData();
      } else {
        Alert.alert(t('common.error'), t('authErrors.generic'));
      }
    } finally {
      setPremiumLoading(false);
    }
  };

  const openPremiumOrRefresh = () => {
    if (isPremium) {
      Alert.alert(t('premium.alreadyActive'), t('premium.alreadyActiveDesc'));
    } else {
      setShowPremiumModal(true);
    }
  };

  const handleLogout = async () => {
    Alert.alert(t('settings.logout'), t('settings.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.logout'),
        onPress: async () => {
          await signOut();
          router.replace('/');
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('settings.deleteAccount'),
      t('settings.deleteConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.deleteAccount'),
          style: 'destructive',
          onPress: async () => {
            if (!firebaseUser) return;
            setDeleting(true);
            try {
              const CLOUD_FUNCTION_URL =
                'https://us-central1-dogly-train.cloudfunctions.net/deleteUserAccount';
              const idToken = await auth.currentUser?.getIdToken();
              if (!idToken) throw new Error('Not authenticated');
              const response = await fetch(CLOUD_FUNCTION_URL, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify({ userId: firebaseUser.uid }),
              });
              if (!response.ok) throw new Error('Delete failed');
              await signOut();
              router.replace('/');
            } catch (error) {
              Alert.alert(t('common.error'), t('authErrors.generic'));
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('settings.title')}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>


        {/* Account section */}
        <Text style={styles.sectionHeader}>{t('settings.sectionAccount')}</Text>
        <View style={styles.card}>
          <SettingsRow
            icon="language-outline"
            label={t('settings.language')}
            onPress={() => setShowLangModal(true)}
            value={`${currentLang.flag} ${currentLang.label}`}
          />
        </View>

        {/* Premium / Remove ads section */}
        <Text style={styles.sectionHeader}>{t('premium.section')}</Text>
        {isPremium ? (
          <View style={[styles.card, styles.premiumActiveCard]}>
            <View style={styles.premiumActiveRow}>
              <View style={styles.premiumActiveIcon}>
                <Ionicons name="star" size={24} color={colors.boost} />
              </View>
              <View style={styles.premiumActiveBody}>
                <Text style={styles.premiumActiveTitle}>{t('premium.activeTitle')}</Text>
                <Text style={styles.premiumActiveDesc}>{t('premium.activeDesc')}</Text>
              </View>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.card, styles.premiumCard]}
            onPress={openPremiumOrRefresh}
            disabled={premiumLoading}
            activeOpacity={0.85}
          >
            <View style={styles.premiumCardLeft}>
              <View style={styles.premiumIconBox}>
                <Ionicons name="ban-outline" size={22} color={colors.primary} />
              </View>
              <View style={styles.premiumTextWrap}>
                <Text style={styles.premiumTitle}>{t('premium.removeAdsTitle')}</Text>
                <Text style={styles.premiumDesc}>{t('premium.removeAdsDesc')}</Text>
              </View>
            </View>
            <View style={styles.premiumPriceWrap}>
              <Text style={styles.premiumPrice}>{PREMIUM_PRICE_EUR.toFixed(2)}€</Text>
              <Text style={styles.premiumPriceLabel}>{t('premium.oneTime')}</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Preferences section */}
        <Text style={styles.sectionHeader}>{t('settings.sectionPreferences')}</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowIconBox}>
              <Ionicons name="phone-portrait-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>{t('settings.hapticsLabel')}</Text>
              <Text style={styles.hapticsHint}>{t('settings.hapticsHint')}</Text>
            </View>
            <Switch
              value={!(userData?.preferences?.disableHaptics === true)}
              onValueChange={async (next) => {
                if (!firebaseUser) return;
                const newPreferences = {
                  ...(userData?.preferences ?? {}),
                  disableHaptics: !next,
                };
                // Optimistic update — the toggle should feel instant.
                setUserData({ ...userData!, preferences: newPreferences });
                try {
                  await updateUserProfile(firebaseUser.uid, { preferences: newPreferences });
                } catch {
                  // Revert on failure
                  setUserData({ ...userData! });
                }
              }}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.background}
            />
          </View>
        </View>

        {/* Privacy & Legal section */}
        <Text style={styles.sectionHeader}>{t('settings.privacy')}</Text>
        <View style={styles.card}>
          <SettingsRow
            icon="shield-checkmark-outline"
            label={t('settings.privacyPolicy')}
            onPress={() => Linking.openURL('https://dogly-train.web.app/privacy-policy')}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="document-text-outline"
            label={t('settings.termsOfService')}
            onPress={() => Linking.openURL('https://dogly-train.web.app/terms-of-service')}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="notifications-outline"
            label={t('settings.notifications')}
            onPress={() =>
              Alert.alert(
                t('settings.notifications'),
                t('settings.notificationsText')
              )
            }
          />
        </View>

        {/* Danger zone */}
        <Text style={styles.sectionHeader}>{t('settings.sectionDangerZone')}</Text>
        <View style={styles.card}>
          <SettingsRow
            icon="log-out-outline"
            label={t('settings.logout')}
            onPress={handleLogout}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="trash-outline"
            label={t('settings.deleteAccount')}
            onPress={handleDeleteAccount}
            danger
          />
        </View>

        <Text style={styles.version}>Dogly Train v1.0.0</Text>
      </ScrollView>

      {/* Language Modal */}
      <Modal
        visible={showLangModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowLangModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('settings.language')}</Text>
            {LANGUAGES.map((lang) => {
              const isSelected = lang.code === i18n.language;
              return (
                <TouchableOpacity
                  key={lang.code}
                  style={[styles.langOption, isSelected && styles.langOptionSelected]}
                  onPress={() => handleLanguageChange(lang.code)}
                >
                  <Text style={styles.langFlag}>{lang.flag}</Text>
                  <Text style={[styles.langLabel, isSelected && styles.langLabelSelected]}>
                    {lang.label}
                  </Text>
                  {isSelected && (
                    <Ionicons name="checkmark" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => setShowLangModal(false)}
            >
              <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Premium Payment Method Modal */}
      <Modal
        visible={showPremiumModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPremiumModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.premiumModalHeader}>
              <Ionicons name="ban-outline" size={28} color={colors.primary} />
              <Text style={styles.modalTitle}>{t('premium.removeAdsTitle')}</Text>
              <Text style={styles.premiumModalPrice}>{PREMIUM_PRICE_EUR.toFixed(2)}€</Text>
              <Text style={styles.premiumModalPriceLabel}>{t('premium.oneTime')}</Text>
            </View>

            <Text style={styles.premiumModalDesc}>{t('premium.removeAdsDesc')}</Text>

            <TouchableOpacity
              style={[styles.payOption, premiumLoading && styles.payOptionDisabled]}
              onPress={() => handleBuyPremium('stripe')}
              disabled={premiumLoading}
              activeOpacity={0.85}
            >
              <Ionicons name="card-outline" size={20} color={colors.primary} />
              <Text style={styles.payOptionText}>{t('premium.payCard')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.payOption, premiumLoading && styles.payOptionDisabled]}
              onPress={() => handleBuyPremium('paypal')}
              disabled={premiumLoading}
              activeOpacity={0.85}
            >
              <Ionicons name="logo-paypal" size={20} color="#0070BA" />
              <Text style={styles.payOptionText}>{t('coins.payWithPaypal')}</Text>
            </TouchableOpacity>

            <Text style={styles.premiumDisclaimer}>{t('legal.purchaseDisclaimer')}</Text>

            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => setShowPremiumModal(false)}
              disabled={premiumLoading}
            >
              <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    marginRight: spacing.md,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textLight,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginLeft: 56,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  rowIconBox: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconBoxDanger: {
    backgroundColor: colors.error + '15',
  },
  rowLabel: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
    fontWeight: '500',
  },
  rowLabelDanger: {
    color: colors.error,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rowValue: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  hapticsHint: {
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: 2,
  },
  version: {
    fontSize: fontSize.xs,
    color: colors.textLight,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.lg,
  },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
  },
  langOptionSelected: {
    backgroundColor: colors.primary + '10',
  },
  langFlag: {
    fontSize: 24,
  },
  langLabel: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
  },
  langLabelSelected: {
    fontWeight: '700',
    color: colors.primary,
  },
  modalCancel: {
    marginTop: spacing.md,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  modalCancelText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  // Premium card (purchase prompt)
  premiumCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.primary + '40',
  },
  premiumCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
  },
  premiumIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumTextWrap: { flex: 1 },
  premiumTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  premiumDesc: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  premiumPriceWrap: { alignItems: 'flex-end' },
  premiumPrice: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.primary,
  },
  premiumPriceLabel: {
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
  // Premium active state
  premiumActiveCard: {
    backgroundColor: colors.boost + '12',
    borderWidth: 1,
    borderColor: colors.boost + '40',
  },
  premiumActiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  premiumActiveIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.boost + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumActiveBody: { flex: 1 },
  premiumActiveTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  premiumActiveDesc: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  // Premium modal
  premiumModalHeader: {
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  premiumModalPrice: {
    fontSize: fontSize.title,
    fontWeight: '800',
    color: colors.primary,
    marginTop: spacing.xs,
  },
  premiumModalPriceLabel: {
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
  premiumModalDesc: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  payOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  payOptionDisabled: { opacity: 0.5 },
  payOptionText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  premiumDisclaimer: {
    fontSize: fontSize.xs,
    color: colors.textLight,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 16,
  },
});
