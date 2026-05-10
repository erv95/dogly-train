import React, { useMemo, useState } from 'react';
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
import { createCheckoutSession, createPaypalOrder } from '../../src/services/coins';
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
  const [paypalLoading, setPaypalLoading] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: t('coins.buyCoins') });
  }, [t, navigation]);

  const buttonTitle = useMemo(() => {
    if (!selectedPackage) return t('coins.buyCoins');
    const pkg = COIN_PACKAGES.find((p) => p.id === selectedPackage);
    return pkg ? `${t('coins.buyCoins')} - $${pkg.price.toFixed(2)}` : t('coins.buyCoins');
  }, [selectedPackage, t]);

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

  const handlePaypal = async () => {
    if (!selectedPackage || !firebaseUser) return;
    setPaypalLoading(true);
    try {
      const approvalUrl = await createPaypalOrder(firebaseUser.uid, selectedPackage);
      const supported = await Linking.canOpenURL(approvalUrl);
      if (supported) {
        await Linking.openURL(approvalUrl);
      } else {
        Alert.alert(t('common.error'), t('authErrors.generic'));
      }
    } catch (error) {
      Alert.alert(t('common.error'), t('authErrors.generic'));
    } finally {
      setPaypalLoading(false);
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
        title={buttonTitle}
        onPress={handlePurchase}
        loading={loading}
        disabled={!selectedPackage}
        size="lg"
      />

      {/* PayPal divider + button */}
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>{t('coins.orPayWith')}</Text>
        <View style={styles.dividerLine} />
      </View>

      <TouchableOpacity
        style={[styles.paypalBtn, (!selectedPackage || paypalLoading) && styles.paypalBtnDisabled]}
        onPress={handlePaypal}
        disabled={!selectedPackage || paypalLoading}
        activeOpacity={0.8}
      >
        {paypalLoading ? (
          <Text style={styles.paypalBtnText}>...</Text>
        ) : (
          <>
            <Ionicons name="logo-paypal" size={20} color="#003087" />
            <Text style={styles.paypalBtnText}>{t('coins.payWithPaypal')}</Text>
          </>
        )}
      </TouchableOpacity>

      <View style={styles.legalFooter}>
        <Text style={styles.disclaimer}>
          {t('legal.purchaseDisclaimer')}
        </Text>
        <Text style={styles.disclaimer}>
          {t('legal.processedBy')}
        </Text>
        <Text
          style={styles.legalLink}
          onPress={() => Linking.openURL('https://dogly-train.web.app/terms-of-service')}
        >
          {t('legal.viewTerms')}
        </Text>
      </View>
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
  legalFooter: {
    marginTop: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
  },
  disclaimer: {
    fontSize: fontSize.xs,
    color: colors.textLight,
    textAlign: 'center',
  },
  legalLink: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '600',
    textDecorationLine: 'underline',
    marginTop: spacing.xs,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
    gap: spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontSize: fontSize.xs,
    color: colors.textLight,
    fontWeight: '600',
  },
  paypalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: '#FFC439',
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.sm,
  },
  paypalBtnDisabled: {
    opacity: 0.5,
  },
  paypalBtnText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: '#003087',
  },
});
