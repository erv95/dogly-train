import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '../../src/components/ui';
import { colors, spacing, fontSize, borderRadius } from '../../src/theme';

const FEATURES = [
  {
    icon: 'search-circle-outline',
    title: 'Encuentra tu entrenador',
    desc: 'Busca entre profesionales cercanos a ti, filtrados por especialidad y valoración.',
    color: '#F59E0B',
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Perfiles verificados',
    desc: 'Todos los entrenadores pasan por un proceso de validación antes de aparecer.',
    color: '#10B981',
  },
  {
    icon: 'chatbubbles-outline',
    title: 'Contacto directo',
    desc: 'Habla con el entrenador antes de contratar. Sin intermediarios.',
    color: '#6366F1',
  },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#FFFDF7', '#FFF8ED', '#FFFFFF']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>

        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoEmoji}>🐕</Text>
          </View>
          <Text style={styles.title}>Dogly Train</Text>
          <Text style={styles.subtitle}>{t('auth.welcomeSubtitle')}</Text>
        </View>

        {/* Features */}
        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f.title} style={styles.featureRow}>
              <View style={[styles.iconWrap, { backgroundColor: f.color + '18' }]}>
                <Ionicons name={f.icon as any} size={22} color={f.color} />
              </View>
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Buttons */}
        <View style={styles.buttons}>
          <Button
            title={t('auth.login')}
            onPress={() => router.push('/(auth)/login')}
            size="lg"
          />
          <Button
            title={t('auth.register')}
            onPress={() => router.push('/(auth)/register')}
            variant="outline"
            size="lg"
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    padding: spacing.xl,
  },
  hero: {
    alignItems: 'center',
    paddingTop: spacing.lg,
  },
  logoCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  logoEmoji: {
    fontSize: 58,
  },
  title: {
    fontSize: fontSize.title,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  features: {
    gap: spacing.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  buttons: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
});
