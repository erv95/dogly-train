import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import ClickerWhistle from '../../src/components/ClickerWhistle';
import { colors, spacing, fontSize, borderRadius } from '../../src/theme';

export default function ClickerScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const router = useRouter();

  useEffect(() => {
    navigation.setOptions({ title: t('clicker.title') });
  }, [navigation, t]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header card */}
        <View style={styles.headerCard}>
          <View style={styles.headerIcon}>
            <Ionicons name="paw" size={32} color={colors.primary} />
          </View>
          <Text style={styles.headerTitle}>{t('clicker.heroTitle')}</Text>
          <Text style={styles.headerDesc}>{t('clicker.description')}</Text>
        </View>

        {/* Component */}
        <ClickerWhistle />

        {/* Educational tip */}
        <View style={styles.tipCard}>
          <View style={styles.tipHeader}>
            <Ionicons name="bulb" size={20} color={colors.boost} />
            <Text style={styles.tipLabel}>{t('clicker.tipLabel')}</Text>
          </View>
          <Text style={styles.tipText}>{t('clicker.tipText')}</Text>
        </View>

        {/* Back button */}
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={18} color={colors.primary} />
          <Text style={styles.backBtnText}>{t('common.back')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  headerCard: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  headerDesc: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  tipCard: {
    backgroundColor: colors.boost + '12',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.boost,
    gap: spacing.xs,
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  tipLabel: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.text,
  },
  tipText: {
    fontSize: fontSize.sm,
    color: colors.text,
    lineHeight: 20,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  backBtnText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.primary,
  },
});
