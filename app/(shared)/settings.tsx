import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import i18n from '../../src/config/i18n';
import { signOut } from '../../src/services/auth';
import { updateUserProfile } from '../../src/services/users';
import { useAuth } from '../../src/contexts/AuthContext';
import { colors, spacing, fontSize, borderRadius } from '../../src/theme';

const LANGUAGES = [
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
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
  const [deleting, setDeleting] = useState(false);

  const currentLang = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0];

  const handleLanguageChange = async (code: string) => {
    i18n.changeLanguage(code);
    setShowLangModal(false);
    if (firebaseUser) {
      try {
        await updateUserProfile(firebaseUser.uid, { language: code });
        setUserData({ ...userData!, language: code });
      } catch (e) {
        // Non-critical — language already changed in i18n
      }
    }
  };

  const handleLogout = async () => {
    Alert.alert(t('settings.logout'), t('settings.deleteConfirm').replace('?', '.'), [
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
              const response = await fetch(CLOUD_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>{t('settings.title')}</Text>

        {/* Account section */}
        <Text style={styles.sectionHeader}>Account</Text>
        <View style={styles.card}>
          <SettingsRow
            icon="language-outline"
            label={t('settings.language')}
            onPress={() => setShowLangModal(true)}
            value={`${currentLang.flag} ${currentLang.label}`}
          />
        </View>

        {/* Privacy section */}
        <Text style={styles.sectionHeader}>{t('settings.privacy')}</Text>
        <View style={styles.card}>
          <SettingsRow
            icon="shield-checkmark-outline"
            label={t('settings.privacy')}
            onPress={() =>
              Alert.alert(
                t('settings.privacy'),
                'Dogly Train respects your privacy. We store only the data necessary to provide our service. You can request deletion at any time.'
              )
            }
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="notifications-outline"
            label={t('settings.notifications')}
            onPress={() =>
              Alert.alert(
                t('settings.notifications'),
                'Manage notification preferences in your device settings.'
              )
            }
          />
        </View>

        {/* Danger zone */}
        <Text style={styles.sectionHeader}>Danger zone</Text>
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
});
