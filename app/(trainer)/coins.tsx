import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  FlatList,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { getTransactionHistory, activateBoost } from '../../src/services/coins';
import { Card, Button } from '../../src/components/ui';
import { colors, spacing, fontSize, borderRadius, BOOST_COST } from '../../src/theme';
import { TrainerProfile, CoinTransaction } from '../../src/types';

function getBoostTimeRemaining(boostedUntil: any): { hours: number; minutes: number } | null {
  if (!boostedUntil) return null;
  const end = boostedUntil.toDate ? boostedUntil.toDate() : new Date(boostedUntil);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  if (diff <= 0) return null;
  return {
    hours: Math.floor(diff / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
  };
}

export default function CoinsScreen() {
  const { t } = useTranslation();
  const { firebaseUser, userData, setUserData } = useAuth();
  const router = useRouter();
  const trainer = userData as TrainerProfile | null;

  const [transactions, setTransactions] = useState<CoinTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [boostLoading, setBoostLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const boostTime = getBoostTimeRemaining(trainer?.boostedUntil);
  const isBoosted = boostTime !== null;

  const loadTransactions = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const result = await getTransactionHistory(firebaseUser.uid);
      setTransactions(result);
    } catch (error) {
      console.error('Error loading transactions:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [firebaseUser]);

  useFocusEffect(
    useCallback(() => {
      loadTransactions();
    }, [loadTransactions])
  );

  const handleBoost = () => {
    if (!firebaseUser || !trainer) return;

    if ((trainer.coinBalance ?? 0) < BOOST_COST) {
      Alert.alert(t('common.error'), t('coins.insufficientCoins'));
      return;
    }

    Alert.alert(
      t('coins.activateBoost'),
      t('coins.boostCost'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          onPress: async () => {
            setBoostLoading(true);
            try {
              await activateBoost(firebaseUser.uid);
              // Optimistic update
              setUserData({
                ...userData!,
                coinBalance: (trainer.coinBalance ?? 0) - BOOST_COST,
              } as any);
              Alert.alert(t('common.ok'), t('trainer.boostActive'));
              loadTransactions();
            } catch (error: any) {
              Alert.alert(t('common.error'), error.message || t('authErrors.generic'));
            } finally {
              setBoostLoading(false);
            }
          },
        },
      ]
    );
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'purchase': return { name: 'add-circle' as const, color: colors.success };
      case 'boost_spend': return { name: 'flash' as const, color: colors.warning };
      case 'refund': return { name: 'refresh-circle' as const, color: colors.info };
      default: return { name: 'ellipse' as const, color: colors.textLight };
    }
  };

  const formatDate = (timestamp: any): string => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString();
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadTransactions(); }}
            colors={[colors.primary]}
          />
        }
      >
        <Text style={styles.title}>{t('trainer.coins')}</Text>

        {/* Balance card */}
        <Card style={styles.balanceCard}>
          <Ionicons name="wallet" size={32} color={colors.primary} />
          <Text style={styles.balanceLabel}>{t('coins.balance')}</Text>
          <Text style={styles.balanceValue}>{trainer?.coinBalance ?? 0}</Text>
        </Card>

        {/* Boost status */}
        {isBoosted && (
          <View style={styles.boostBanner}>
            <Ionicons name="flash" size={20} color={colors.boost} />
            <View>
              <Text style={styles.boostTitle}>{t('trainer.boostActive')}</Text>
              <Text style={styles.boostExpiry}>
                {t('trainer.boostExpires', { hours: boostTime.hours, minutes: boostTime.minutes })}
              </Text>
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            title={t('coins.buyCoins')}
            onPress={() => router.push('/(shared)/purchase')}
            size="lg"
          />
          {!isBoosted && (
            <Button
              title={`${t('coins.activateBoost')} (${BOOST_COST} coins)`}
              onPress={handleBoost}
              loading={boostLoading}
              variant="outline"
              size="lg"
              disabled={(trainer?.coinBalance ?? 0) < BOOST_COST}
            />
          )}
        </View>

        {/* Transaction history */}
        <Text style={styles.sectionTitle}>{t('coins.transactions')}</Text>
        {transactions.length === 0 && !loading ? (
          <Text style={styles.emptyText}>{t('common.noResults')}</Text>
        ) : (
          transactions.map((tx) => {
            const icon = getTransactionIcon(tx.type);
            const isPositive = tx.amount > 0;
            return (
              <View key={tx.id} style={styles.txRow}>
                <Ionicons name={icon.name} size={24} color={icon.color} />
                <View style={styles.txInfo}>
                  <Text style={styles.txType}>
                    {tx.type === 'purchase' ? t('coins.purchaseSuccess') :
                     tx.type === 'boost_spend' ? t('coins.activateBoost') :
                     'Refund'}
                  </Text>
                  <Text style={styles.txDate}>{formatDate(tx.createdAt)}</Text>
                </View>
                <Text style={[styles.txAmount, isPositive ? styles.txPositive : styles.txNegative]}>
                  {isPositive ? '+' : ''}{tx.amount}
                </Text>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
  balanceCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    marginBottom: spacing.md,
  },
  balanceLabel: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  balanceValue: {
    fontSize: 48,
    fontWeight: '800',
    color: colors.primary,
    marginTop: spacing.xs,
  },
  boostBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.boost + '15',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.boost,
  },
  boostTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: fontSize.sm,
  },
  boostExpiry: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  actions: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  txInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  txType: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
  },
  txDate: {
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: 2,
  },
  txAmount: {
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  txPositive: {
    color: colors.success,
  },
  txNegative: {
    color: colors.error,
  },
});
