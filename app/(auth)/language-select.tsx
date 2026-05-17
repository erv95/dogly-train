import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setLanguage } from '../../src/config/i18n';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../src/theme';

const LANGUAGES = [
  { code: 'es', flag: '🇪🇸', label: 'Español',   native: 'Español' },
  { code: 'en', flag: '🇬🇧', label: 'English',   native: 'English' },
  { code: 'fr', flag: '🇫🇷', label: 'Français',  native: 'Français' },
  { code: 'pt', flag: '🇵🇹', label: 'Português', native: 'Português' },
  { code: 'de', flag: '🇩🇪', label: 'Deutsch',   native: 'Deutsch' },
];

const TITLES: Record<string, string> = {
  es: '¿En qué idioma quieres usar la app?',
  en: 'Which language would you like to use?',
  fr: 'Dans quelle langue souhaitez-vous utiliser l\'app ?',
  pt: 'Em que língua queres usar a app?',
  de: 'In welcher Sprache möchtest du die App nutzen?',
};

const CONFIRM: Record<string, string> = {
  es: 'Continuar',
  en: 'Continue',
  fr: 'Continuer',
  pt: 'Continuar',
  de: 'Weiter',
};

export default function LanguageSelectScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!selected) return;
    await AsyncStorage.setItem('@dogly_language', selected);
    await AsyncStorage.setItem('@dogly_lang_selected', '1');
    await setLanguage(selected);
    // Bounce through the index so the onboarding gate decides whether to show
    // the 5-slide intro or go straight to welcome.
    router.replace('/');
  };

  const title = selected ? TITLES[selected] : TITLES['es'];
  const confirmLabel = selected ? CONFIRM[selected] : CONFIRM['es'];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoCircle}>
          <Text style={styles.logo}>🐾</Text>
        </View>
        <Text style={styles.appName}>Dogly Train</Text>
        <Text style={styles.title}>{title}</Text>
      </View>

      {/* Language options */}
      <ScrollView
        style={styles.listScroll}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {LANGUAGES.map((lang) => {
          const isSelected = selected === lang.code;
          return (
            <TouchableOpacity
              key={lang.code}
              style={[styles.card, isSelected && styles.cardSelected]}
              onPress={() => setSelected(lang.code)}
              activeOpacity={0.85}
            >
              <View style={[styles.flagWrap, isSelected && styles.flagWrapSelected]}>
                <Text style={styles.flag}>{lang.flag}</Text>
              </View>
              <Text style={[styles.langLabel, isSelected && styles.langLabelSelected]}>
                {lang.native}
              </Text>
              {isSelected && (
                <View style={styles.checkBubble}>
                  <Ionicons name="checkmark" size={16} color={colors.textOnPrimary} />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Confirm button */}
      <TouchableOpacity
        style={[styles.btn, !selected && styles.btnDisabled]}
        onPress={handleConfirm}
        disabled={!selected}
        activeOpacity={0.85}
      >
        <Text style={[styles.btnText, !selected && styles.btnTextDisabled]}>{confirmLabel}</Text>
        <Ionicons
          name="arrow-forward"
          size={18}
          color={selected ? colors.textOnPrimary : colors.textLight}
        />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  header: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primary + '30',
  },
  logo: { fontSize: 48 },
  appName: {
    fontSize: fontSize.title,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -1,
    marginTop: spacing.md,
  },
  title: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 22,
    paddingHorizontal: spacing.md,
  },
  listScroll: {
    flex: 1,
    marginTop: spacing.md,
  },
  list: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: spacing.md,
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '08',
    borderWidth: 2,
    // Intentionally no shadow — Android (MIUI especially) renders shadows as a
    // hard grey rectangle ignoring borderRadius, which looks worse than no
    // depth at all. The colored border + tinted background read as "selected".
  },
  flagWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagWrapSelected: {
    backgroundColor: colors.primary + '15',
  },
  flag: { fontSize: 28, lineHeight: 32 },
  langLabel: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
  },
  langLabelSelected: {
    color: colors.primary,
    fontWeight: '800',
  },
  checkBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.md + 2,
    marginTop: spacing.md,
    ...shadow.md,
  },
  btnDisabled: {
    backgroundColor: colors.borderLight,
    shadowOpacity: 0,
    elevation: 0,
  },
  btnText: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.textOnPrimary,
    letterSpacing: 0.3,
  },
  btnTextDisabled: {
    color: colors.textLight,
  },
});
