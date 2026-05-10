import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Share,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '../../src/contexts/AuthContext';
import {
  getMyReferrals,
  getReferralStats,
  type ReferralStats,
} from '../../src/services/referrals';
import { Referral } from '../../src/types';
import { useHaptics } from '../../src/hooks/useHaptics';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../src/theme';

const STATUS_META: Record<Referral['status'], { color: string; bg: string; icon: any }> = {
  pending: { color: colors.warning, bg: colors.warning + '15', icon: 'hourglass-outline' },
  claimed: { color: colors.success, bg: colors.success + '15', icon: 'checkmark-circle-outline' },
  rejected: { color: colors.error, bg: colors.error + '15', icon: 'close-circle-outline' },
  review: { color: colors.info, bg: colors.info + '15', icon: 'shield-outline' },
};

export default function ReferralsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { firebaseUser, userData } = useAuth();
  const haptics = useHaptics();

  const [stats, setStats] = useState<ReferralStats>({ total: 0, claimed: 0, pending: 0, coinsEarned: 0 });
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const code = userData?.displayId ?? '';

  const load = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const [s, list] = await Promise.all([
        getReferralStats(firebaseUser.uid),
        getMyReferrals(firebaseUser.uid),
      ]);
      setStats(s);
      setReferrals(list);
    } catch (e) {
      console.error('referrals load', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCopy = async () => {
    if (!code) {
      haptics.error();
      Alert.alert(t('common.error'), t('referrals.codeMissing'));
      return;
    }
    try {
      await Clipboard.setStringAsync(code);
      haptics.success();
      Alert.alert(t('referrals.copiedTitle'), t('referrals.copiedBody', { code }));
    } catch (e) {
      haptics.error();
      Alert.alert(t('common.error'), t('authErrors.generic'));
    }
  };

  const handleShare = async () => {
    if (!code) {
      haptics.error();
      Alert.alert(t('common.error'), t('referrals.codeMissing'));
      return;
    }
    haptics.tap();
    try {
      await Share.share({ message: t('referrals.shareMessage', { code }) });
    } catch {
      // user cancelled — silent
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: t('referrals.title') }} />
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            colors={[colors.primary]}
          />
        }
      >
        {/* Code card */}
        <View style={styles.codeCard}>
          <Ionicons name="gift-outline" size={28} color={colors.primary} />
          <Text style={styles.codeLabel}>{t('referrals.yourCode')}</Text>
          <Text style={styles.code}>{code || '·····'}</Text>
          <Text style={styles.codeHint}>{t('referrals.howItWorks')}</Text>

          <View style={styles.actionsRow}>
            <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={handleCopy}>
              <Ionicons name="copy-outline" size={16} color={colors.primary} />
              <Text style={styles.btnSecondaryText}>{t('referrals.copy')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={handleShare}>
              <Ionicons name="share-social-outline" size={16} color={colors.textOnPrimary} />
              <Text style={styles.btnPrimaryText}>{t('referrals.share')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats strip */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{stats.total}</Text>
            <Text style={styles.statLabel}>{t('referrals.statTotal')}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{stats.claimed}</Text>
            <Text style={styles.statLabel}>{t('referrals.statClaimed')}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: colors.boost }]}>{stats.coinsEarned}</Text>
            <Text style={styles.statLabel}>{t('referrals.statCoins')}</Text>
          </View>
        </View>

        {/* List */}
        <Text style={styles.sectionHeader}>{t('referrals.listTitle')}</Text>
        {loading ? (
          <Text style={styles.muted}>{t('common.loading')}</Text>
        ) : referrals.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={40} color={colors.textLight} />
            <Text style={styles.emptyTitle}>{t('referrals.emptyTitle')}</Text>
            <Text style={styles.emptyBody}>{t('referrals.emptyBody')}</Text>
          </View>
        ) : (
          referrals.map((r) => {
            const meta = STATUS_META[r.status];
            return (
              <View key={r.id} style={styles.row}>
                <View style={[styles.rowIcon, { backgroundColor: meta.bg }]}>
                  <Ionicons name={meta.icon} size={18} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>
                    {t(`referrals.statusLabel.${r.status}`)}
                  </Text>
                  <Text style={styles.rowSub}>
                    {r.createdAt.toDate().toLocaleDateString()}
                  </Text>
                </View>
                {r.status === 'claimed' && (
                  <Text style={styles.rowReward}>+30</Text>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  codeCard: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.primary + '40',
    ...shadow.sm,
  },
  codeLabel: { fontSize: fontSize.xs, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700' },
  code: {
    fontSize: 36,
    fontWeight: '900',
    color: colors.primary,
    letterSpacing: 4,
    fontVariant: ['tabular-nums'] as any,
  },
  codeHint: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: fontSize.sm },
  btnSecondary: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.primary },
  btnSecondaryText: { color: colors.primary, fontWeight: '700', fontSize: fontSize.sm },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  statBox: { alignItems: 'center', gap: 2 },
  statValue: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: fontSize.xs, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionHeader: {
    fontSize: fontSize.xs, fontWeight: '700', color: colors.textLight,
    textTransform: 'uppercase', letterSpacing: 1, marginTop: spacing.md,
  },
  muted: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.lg },
  empty: { alignItems: 'center', padding: spacing.lg, gap: spacing.xs },
  emptyTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  emptyBody: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  rowIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  rowSub: { fontSize: fontSize.xs, color: colors.textLight },
  rowReward: { fontSize: fontSize.lg, fontWeight: '900', color: colors.boost },
});
