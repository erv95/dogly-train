import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { createCheckoutSession } from '../../src/services/coins';
import { Button, Card } from '../../src/components/ui';
import { colors, spacing, fontSize, borderRadius, shadow, COIN_PACKAGES } from '../../src/theme';
import { useEffect } from 'react';

export default function PurchaseScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const { firebaseUser } = useAuth();

  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: t('coins.buyCoins') });
  }, [t, navigation]);

  const handlePurchase = async () => {
    if (!selectedPackage || !firebaseUser) return;

    setLoading(true);
    try {
      const checkoutUrl = await createCheckoutSession(firebaseUser.uid, selectedPackage);
      // Redirect to Stripe Checkout in browser
      const supported = await Linking.canOpenURL(checkoutUrl);
      if (supported) {
        await Linking.openURL(checkoutUrl);
      } else {
        Alert.alert(t('common.error'), t('authErrors.generic'));
      }
    } catch (error) {
      Alert.alert(t('common.error'), t('authErrors.generic'));
    } finally {
      setLoading(false);
    }
  };

  const getBestValue = () => {
    // Biggest package = best value
    return COIN_PACKAGES[COIN_PACKAGES.length - 1].id;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.headerInfo}>
        <Ionicons name="wallet-outline" size={48} color={colors.primary} />
        <Text style={styles.headerTitle}>{t('coins.buyCoins')}</Text>
        <Text style={styles.headerSubtitle}>{t('coins.boostCost')}</Text>
      </View>

      <View style={styles.packagesGrid}>
        {COIN_PACKAGES.map((pkg) => {
          const isSelected = selectedPackage === pkg.id;
          const isBestValue = pkg.id === getBestValue();
          const pricePerCoin = (pkg.price / pkg.coins).toFixed(3);

          return (
            <TouchableOpacity
              key={pkg.id}
              style={[
                styles.packageCard,
                isSelected && styles.packageCardSelected,
                isBestValue && styles.packageCardBest,
              ]}
              onPress={() => setSelectedPackage(pkg.id)}
              activeOpacity={0.7}
            >
              {isBestValue && (
                <View style={styles.bestBadge}>
                  <Text style={styles.bestBadgeText}>BEST</Text>
                </View>
              )}
              <Ionicons
                name="logo-bitcoin"
                size={28}
                color={isSelected ? colors.primary : colors.textLight}
              />
              <Text style={[styles.packageCoins, isSelected && styles.packageCoinsSelected]}>
                {pkg.coins}
              </Text>
              <Text style={styles.packageLabel}>{t('coins.package', { amount: pkg.coins })}</Text>
              <Text style={[styles.packagePrice, isSelected && styles.packagePriceSelected]}>
                ${pkg.price.toFixed(2)}
              </Text>
              <Text style={styles.pricePerCoin}>
                ${pricePerCoin}/coin
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Button
        title={selectedPackage
          ? `${t('coins.buyCoins')} - $${COIN_PACKAGES.find(p => p.id === selectedPackage)?.price.toFixed(2) ?? ''}`
          : t('coins.buyCoins')
        }
        onPress={handlePurchase}
        loading={loading}
        disabled={!selectedPackage}
        size="lg"
      />

      <Text style={styles.disclaimer}>
        {t('coins.boostCost')}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  headerInfo: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  headerTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.md,
  },
  headerSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  packagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xl,
    justifyContent: 'center',
  },
  packageCard: {
    width: '45%',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background,
    ...shadow.sm,
  },
  packageCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '08',
  },
  packageCardBest: {
    borderColor: colors.success,
  },
  bestBadge: {
    position: 'absolute',
    top: -10,
    backgroundColor: colors.success,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  bestBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textOnPrimary,
  },
  packageCoins: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.text,
    marginTop: spacing.sm,
  },
  packageCoinsSelected: {
    color: colors.primary,
  },
  packageLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  packagePrice: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.sm,
  },
  packagePriceSelected: {
    color: colors.primary,
  },
  pricePerCoin: {
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: 2,
  },
  disclaimer: {
    fontSize: fontSize.xs,
    color: colors.textLight,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
