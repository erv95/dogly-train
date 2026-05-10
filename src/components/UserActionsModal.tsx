import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { User, UserRole, UserStatus } from '../types';
import {
  updateUserStatus,
  updateUserRole,
  setUserMarketplaceActive,
  adminSyncUserDenormalized,
} from '../services/adminUsers';
import { adminGrantCoins, GrantCoinsError } from '../services/adminCoins';
import { Avatar } from './ui';
import { colors, spacing, fontSize, borderRadius, shadow } from '../theme';

const STATUS_META: Record<UserStatus, { color: string; icon: keyof typeof Ionicons.glyphMap; emoji: string }> = {
  active:    { color: colors.success, icon: 'checkmark-circle', emoji: '🟢' },
  suspended: { color: colors.warning, icon: 'pause-circle',     emoji: '🟡' },
  banned:    { color: colors.error,   icon: 'ban',              emoji: '🔴' },
};

const STATUS_OPTIONS: UserStatus[] = ['active', 'suspended', 'banned'];
const ROLE_OPTIONS: UserRole[] = ['owner', 'trainer', 'caretaker'];

const ROLE_ICONS: Record<UserRole, keyof typeof Ionicons.glyphMap> = {
  owner: 'paw',
  trainer: 'school',
  caretaker: 'home',
};

const ROLE_COLORS: Record<UserRole, string> = {
  owner: '#F59E0B',
  trainer: '#10B981',
  caretaker: '#0EA5E9',
};

interface Props {
  visible: boolean;
  user: User | null;
  /** UID of the admin operating the modal — used to prevent self-actions. */
  adminUid: string;
  onClose: () => void;
  /** Called after a write succeeds so the parent can refetch / patch local list. */
  onUpdated: (uid: string, patch: Partial<User>) => void;
}

export default function UserActionsModal({ visible, user, adminUid, onClose, onUpdated }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const [working, setWorking] = useState<string | null>(null); // action key currently in flight

  if (!user) return null;
  const isSelf = user.id === adminUid;
  const currentStatus: UserStatus = user.status ?? 'active';
  const role = user.role;

  const confirmStatusChange = (next: UserStatus) => {
    if (next === currentStatus) return;
    if (isSelf) {
      Alert.alert(t('admin.userManagement.selfActionTitle'), t('admin.userManagement.selfActionDesc'));
      return;
    }
    const titleKey = next === 'banned'
      ? 'admin.userManagement.confirmBanTitle'
      : next === 'suspended'
        ? 'admin.userManagement.confirmSuspendTitle'
        : 'admin.userManagement.confirmReactivateTitle';
    const descKey = next === 'banned'
      ? 'admin.userManagement.confirmBanDesc'
      : next === 'suspended'
        ? 'admin.userManagement.confirmSuspendDesc'
        : 'admin.userManagement.confirmReactivateDesc';

    Alert.alert(
      t(titleKey, { name: user.displayName }),
      t(descKey),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t(`admin.userManagement.statusActions.${next}`),
          style: next === 'active' ? 'default' : 'destructive',
          onPress: async () => {
            setWorking('status');
            try {
              await updateUserStatus(user.id, next);
              onUpdated(user.id, { status: next });
            } catch {
              Alert.alert(t('common.error'), t('authErrors.generic'));
            } finally {
              setWorking(null);
            }
          },
        },
      ],
    );
  };

  const toggleMarketplace = () => {
    if (role !== 'trainer' && role !== 'caretaker') return;
    const next = !(user.isActive ?? false);
    Alert.alert(
      t(next ? 'admin.userManagement.confirmApproveTitle' : 'admin.userManagement.confirmUnapproveTitle', { name: user.displayName }),
      t(next ? 'admin.userManagement.confirmApproveDesc' : 'admin.userManagement.confirmUnapproveDesc'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t(next ? 'admin.userManagement.approve' : 'admin.userManagement.unapprove'),
          style: next ? 'default' : 'destructive',
          onPress: async () => {
            setWorking('marketplace');
            try {
              await setUserMarketplaceActive(user.id, next);
              onUpdated(user.id, { isActive: next });
            } catch {
              Alert.alert(t('common.error'), t('authErrors.generic'));
            } finally {
              setWorking(null);
            }
          },
        },
      ],
    );
  };

  const confirmRoleChange = (next: UserRole) => {
    if (next === role) return;
    if (isSelf) {
      Alert.alert(t('admin.userManagement.selfActionTitle'), t('admin.userManagement.selfActionDesc'));
      return;
    }
    Alert.alert(
      t('admin.userManagement.confirmRoleTitle', { name: user.displayName }),
      t('admin.userManagement.confirmRoleDesc', { role: t(`auth.${next}`) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('admin.userManagement.changeRole'),
          style: 'destructive',
          onPress: async () => {
            setWorking('role');
            try {
              await updateUserRole(user.id, next);
              onUpdated(user.id, { role: next });
            } catch {
              Alert.alert(t('common.error'), t('authErrors.generic'));
            } finally {
              setWorking(null);
            }
          },
        },
      ],
    );
  };

  const openChat = () => {
    onClose();
    const chatId = [adminUid, user.id].sort().join('_');
    router.push(`/(shared)/chat/${chatId}`);
  };

  const syncProfile = () => {
    Alert.alert(
      t('admin.userManagement.syncProfile.title'),
      t('admin.userManagement.syncProfile.body', { name: user.displayName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('admin.userManagement.syncProfile.confirm'),
          onPress: async () => {
            setWorking('sync');
            try {
              const result = await adminSyncUserDenormalized(user.id);
              Alert.alert(
                t('admin.userManagement.syncProfile.successTitle'),
                t('admin.userManagement.syncProfile.successBody', {
                  chats: result.chats,
                  bookings: result.bookings,
                }),
              );
            } catch (e: any) {
              const code = e?.message ?? 'unknown';
              Alert.alert(
                t('common.error'),
                t(`admin.userManagement.syncProfile.errors.${code}`, {
                  defaultValue: t('admin.userManagement.syncProfile.errors.unknown'),
                }),
              );
            } finally {
              setWorking(null);
            }
          },
        },
      ],
    );
  };

  const grantCoins = (amount: number) => {
    Alert.alert(
      t('admin.grantCoins.title'),
      t('admin.grantCoins.confirmBody', { amount, name: user.displayName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('admin.grantCoins.confirm'),
          onPress: async () => {
            setWorking('coins');
            try {
              const newBalance = await adminGrantCoins(user.id, amount, 'admin_panel');
              onUpdated(user.id, { coinBalance: newBalance });
              Alert.alert(
                t('admin.grantCoins.successTitle'),
                t('admin.grantCoins.successBody', { amount, balance: newBalance }),
              );
            } catch (e: any) {
              const code: GrantCoinsError = (e?.message ?? 'unknown') as GrantCoinsError;
              Alert.alert(
                t('common.error'),
                t(`admin.grantCoins.errors.${code}`, { defaultValue: t('admin.grantCoins.errors.unknown') }),
              );
            } finally {
              setWorking(null);
            }
          },
        },
      ],
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* Header: avatar + name + email + id + role icon */}
            <View style={styles.header}>
              <Avatar uri={user.photoURL} name={user.displayName} size={64} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{user.displayName}</Text>
                <Text style={styles.email} numberOfLines={1}>{user.email}</Text>
                <View style={styles.headerMeta}>
                  <View style={[styles.rolePill, { backgroundColor: ROLE_COLORS[role] + '22' }]}>
                    <Ionicons name={ROLE_ICONS[role]} size={12} color={ROLE_COLORS[role]} />
                    <Text style={[styles.rolePillText, { color: ROLE_COLORS[role] }]}>
                      {t(`auth.${role}`)}
                    </Text>
                  </View>
                  {user.displayId ? <Text style={styles.idText}>#{user.displayId}</Text> : null}
                </View>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={8}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {isSelf && (
              <View style={styles.selfBanner}>
                <Ionicons name="information-circle" size={16} color={colors.primary} />
                <Text style={styles.selfBannerText}>{t('admin.userManagement.selfBanner')}</Text>
              </View>
            )}

            {/* Status section */}
            <Text style={styles.sectionTitle}>{t('admin.userManagement.statusTitle')}</Text>
            <View style={styles.statusRow}>
              {STATUS_OPTIONS.map((s) => {
                const meta = STATUS_META[s];
                const active = currentStatus === s;
                const disabled = isSelf || working === 'status';
                return (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.statusBtn,
                      active && { borderColor: meta.color, backgroundColor: meta.color + '12' },
                      disabled && !active && styles.statusBtnDisabled,
                    ]}
                    onPress={() => confirmStatusChange(s)}
                    disabled={disabled}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.statusEmoji}>{meta.emoji}</Text>
                    <Text style={[styles.statusLabel, active && { color: meta.color, fontWeight: '800' }]}>
                      {t(`admin.userManagement.statusActions.${s}`)}
                    </Text>
                    {active && (
                      <Text style={styles.statusActiveBadge}>
                        {t('admin.userManagement.currentStatus')}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Marketplace approval (trainer/caretaker only) */}
            {(role === 'trainer' || role === 'caretaker') && (
              <>
                <Text style={styles.sectionTitle}>{t('admin.userManagement.marketplaceTitle')}</Text>
                <TouchableOpacity
                  style={[
                    styles.marketplaceBtn,
                    user.isActive ? styles.marketplaceBtnOn : styles.marketplaceBtnOff,
                  ]}
                  onPress={toggleMarketplace}
                  disabled={working === 'marketplace'}
                  activeOpacity={0.85}
                >
                  {working === 'marketplace' ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons
                        name={user.isActive ? 'eye-off' : 'eye'}
                        size={18}
                        color="#fff"
                      />
                      <Text style={styles.marketplaceBtnText}>
                        {user.isActive
                          ? t('admin.userManagement.unapprove')
                          : t('admin.userManagement.approve')}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
                <Text style={styles.helperText}>
                  {user.isActive
                    ? t('admin.userManagement.marketplaceVisibleHint')
                    : t('admin.userManagement.marketplaceHiddenHint')}
                </Text>
              </>
            )}

            {/* Role section */}
            <Text style={styles.sectionTitle}>{t('admin.userManagement.roleTitle')}</Text>
            <View style={styles.roleRow}>
              {ROLE_OPTIONS.map((r) => {
                const active = role === r;
                const disabled = isSelf || working === 'role';
                return (
                  <TouchableOpacity
                    key={r}
                    style={[
                      styles.roleBtn,
                      active && { backgroundColor: ROLE_COLORS[r], borderColor: ROLE_COLORS[r] },
                      disabled && !active && styles.statusBtnDisabled,
                    ]}
                    onPress={() => confirmRoleChange(r)}
                    disabled={disabled}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={ROLE_ICONS[r]}
                      size={16}
                      color={active ? '#fff' : ROLE_COLORS[r]}
                    />
                    <Text style={[styles.roleBtnText, active && { color: '#fff' }]}>
                      {t(`auth.${r}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.helperText}>{t('admin.userManagement.roleHint')}</Text>

            {/* Coin wallet — admin can grant or deduct */}
            <Text style={styles.sectionTitle}>{t('admin.grantCoins.section')}</Text>
            <View style={styles.coinBalanceRow}>
              <Ionicons name="logo-bitcoin" size={18} color={colors.primary} />
              <Text style={styles.coinBalanceText}>
                {t('admin.grantCoins.currentBalance', { balance: user.coinBalance ?? 0 })}
              </Text>
            </View>
            <View style={styles.coinPresetRow}>
              {[10, 50, 100, 500].map((n) => (
                <TouchableOpacity
                  key={n}
                  style={styles.coinPresetBtn}
                  onPress={() => grantCoins(n)}
                  disabled={working === 'coins'}
                >
                  {working === 'coins'
                    ? <ActivityIndicator color={colors.primary} size="small" />
                    : <Text style={styles.coinPresetText}>+{n}</Text>}
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.helperText}>{t('admin.grantCoins.hint')}</Text>

            {/* Quick actions */}
            <Text style={styles.sectionTitle}>{t('admin.userManagement.quickActions')}</Text>
            <TouchableOpacity style={styles.quickBtn} onPress={openChat} activeOpacity={0.7}>
              <Ionicons name="chatbubbles" size={20} color={colors.primary} />
              <Text style={styles.quickBtnText}>{t('admin.userManagement.openChat')}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickBtn}
              onPress={syncProfile}
              activeOpacity={0.7}
              disabled={working === 'sync'}
            >
              {working === 'sync' ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <Ionicons name="refresh-circle" size={20} color={colors.primary} />
              )}
              <Text style={styles.quickBtnText}>{t('admin.userManagement.syncProfile.cta')}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingBottom: spacing.lg,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: 'center', marginTop: spacing.sm,
  },
  scroll: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },

  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  name: { fontSize: fontSize.lg, fontWeight: '900', color: colors.text },
  email: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  rolePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  rolePillText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  idText: { fontSize: 10, color: colors.textLight, fontWeight: '700' },

  selfBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary + '12',
    borderColor: colors.primary + '40',
    borderWidth: 1,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  selfBannerText: { flex: 1, fontSize: fontSize.xs, color: colors.text },

  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },

  statusRow: { flexDirection: 'row', gap: spacing.sm },
  statusBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  statusBtnDisabled: { opacity: 0.4 },
  statusEmoji: { fontSize: 22 },
  statusLabel: { fontSize: fontSize.xs, fontWeight: '700', color: colors.text },
  statusActiveBadge: { fontSize: 9, fontWeight: '800', color: colors.textLight, textTransform: 'uppercase', letterSpacing: 0.5 },

  marketplaceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    ...shadow.sm,
  },
  marketplaceBtnOn: { backgroundColor: colors.error },
  marketplaceBtnOff: { backgroundColor: colors.success },
  marketplaceBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '800' },

  roleRow: { flexDirection: 'row', gap: spacing.sm },
  roleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  roleBtnText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.text },

  helperText: {
    fontSize: 11,
    color: colors.textLight,
    fontStyle: 'italic',
    marginTop: spacing.xs,
    textAlign: 'center',
  },

  quickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.xs,
  },
  quickBtnText: { flex: 1, fontSize: fontSize.sm, fontWeight: '700', color: colors.text },

  coinBalanceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: spacing.sm,
  },
  coinBalanceText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '700' },
  coinPresetRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  coinPresetBtn: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary + '15',
    borderWidth: 1, borderColor: colors.primary + '30',
  },
  coinCustomBtn: { backgroundColor: colors.background, borderColor: colors.primary },
  coinPresetText: { color: colors.primary, fontWeight: '800', fontSize: fontSize.sm },
});
