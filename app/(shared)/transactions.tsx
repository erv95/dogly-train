import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { getTransactionHistory } from '../../src/services/coins';
import { colors, spacing, fontSize, borderRadius } from '../../src/theme';
import { CoinTransaction } from '../../src/types';
import { useEffect } from 'react';

const ICONS: Record<string, { name: any; color: string }> = {
  purchase: { name: 'add-circle', color: colors.success },
  boost_spend: { name: 'flash', color: colors.warning },
  refund: { name: 'refresh-circle', color: colors.info },
};

function formatDate(ts: any): string {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function TransactionsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { firebaseUser } = useAuth();

  const [transactions, setTransactions] = useState<CoinTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: t('coins.historyTitle') });
  }, [t, navigation]);

  const load = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const result = await getTransactionHistory(firebaseUser.uid);
      setTransactions(result);
    } catch (e) {
      console.error('Error loading transactions:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [firebaseUser]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        contentContainerStyle={transactions.length === 0 ? styles.emptyContainer : styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={56} color={colors.border} />
            <Text style={styles.emptyText}>{t('coins.historyEmpty')}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const icon = ICONS[item.type] ?? { name: 'ellipse', color: colors.textLight };
          const isPositive = item.amount > 0;
          const label =
            item.type === 'purchase' ? t('coins.purchaseSuccess') :
            item.type === 'boost_spend' ? t('coins.activateBoost') :
            t('coins.refund');

          return (
            <View style={styles.row}>
              <View style={[styles.iconBox, { backgroundColor: icon.color + '18' }]}>
                <Ionicons name={icon.name} size={22} color={icon.color} />
              </View>
              <View style={styles.info}>
                <Text style={styles.label}>{label}</Text>
                <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
              </View>
              <View style={styles.right}>
                <Text style={[styles.amount, isPositive ? styles.positive : styles.negative]}>
                  {isPositive ? '+' : ''}{item.amount}
                </Text>
                <Text style={styles.balance}>{item.balanceAfter} coins</Text>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { paddingVertical: spacing.sm, paddingBottom: spacing.xxl },
  emptyContainer: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, marginTop: 80 },
  emptyText: { fontSize: fontSize.md, color: colors.textSecondary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1 },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  date: { fontSize: fontSize.xs, color: colors.textLight, marginTop: 2 },
  right: { alignItems: 'flex-end' },
  amount: { fontSize: fontSize.lg, fontWeight: '700' },
  positive: { color: colors.success },
  negative: { color: colors.error },
  balance: { fontSize: fontSize.xs, color: colors.textLight, marginTop: 2 },
});
