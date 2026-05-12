import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from '../../src/services/auth';
import { useAuth } from '../../src/contexts/AuthContext';
import { updateUserProfile } from '../../src/services/users';
import { useProfilePhoto } from '../../src/hooks/useProfilePhoto';
import { Button, Input } from '../../src/components/ui';
import { ProfileAvatar } from '../../src/components/ProfileAvatar';
import { CoinBalancePill } from '../../src/components/CoinBalancePill';
import { colors, spacing, fontSize, borderRadius } from '../../src/theme';

export default function OwnerProfileScreen() {
  const { t } = useTranslation();
  const { firebaseUser, userData, setUserData, isAdmin } = useAuth();
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(userData?.displayName ?? '');
  const [saving, setSaving] = useState(false);

  const { loading: photoLoading, handleChange: handleChangePhoto } = useProfilePhoto({
    currentPhoto: userData?.photoURL,
    updateProfile: (patch) => updateUserProfile(firebaseUser!.uid, patch),
    onUpdated: (newUrl) => setUserData({ ...userData!, photoURL: newUrl }),
  });

  const handleLogout = async () => {
    await signOut();
    router.replace('/(auth)/welcome');
  };

  const handleSave = async () => {
    if (!firebaseUser || !displayName.trim()) return;
    setSaving(true);
    try {
      await updateUserProfile(firebaseUser.uid, { displayName: displayName.trim() });
      setUserData({ ...userData!, displayName: displayName.trim() });
      setEditing(false);
    } catch (error) {
      Alert.alert(t('common.error'), t('authErrors.generic'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('owner.profile')}</Text>
        <View style={styles.headerRight}>
          <CoinBalancePill />
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Avatar */}
        <ProfileAvatar
          photoURL={userData?.photoURL ?? null}
          name={userData?.displayName ?? '?'}
          onPress={handleChangePhoto}
          loading={photoLoading}
        />

        {/* Name */}
        {editing ? (
          <View style={styles.editSection}>
            <Input
              label={t('dogs.name')}
              value={displayName}
              onChangeText={setDisplayName}
            />
            <View style={styles.editButtons}>
              <Button
                title={t('common.cancel')}
                onPress={() => {
                  setDisplayName(userData?.displayName ?? '');
                  setEditing(false);
                }}
                variant="outline"
              />
              <Button
                title={t('common.save')}
                onPress={handleSave}
                loading={saving}
              />
            </View>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setEditing(true)} style={styles.nameRow}>
            <Text style={styles.name}>{userData?.displayName}</Text>
            <Ionicons name="pencil" size={16} color={colors.primary} />
          </TouchableOpacity>
        )}

        <Text style={styles.email}>{userData?.email}</Text>
        {userData?.displayId && (
          <View style={styles.idBadge}>
            <Ionicons name="id-card-outline" size={13} color={colors.primary} />
            <Text style={styles.idText}>#{userData.displayId}</Text>
          </View>
        )}

        <View style={styles.actions}>
          <Button
            title={t('bookings.list.title')}
            onPress={() => router.push('/(owner)/bookings')}
          />
          <Button
            title={t('coins.historyTitle')}
            onPress={() => router.push('/(shared)/transactions')}
            variant="outline"
          />
          <Button
            title={t('referrals.cta')}
            onPress={() => router.push('/(shared)/referrals')}
            variant="outline"
          />
          <Button
            title={t('settings.title')}
            onPress={() => router.push('/(shared)/settings')}
            variant="outline"
          />
          {isAdmin && (
            <Button
              title={t('settings.adminPanel')}
              onPress={() => router.push('/(shared)/admin')}
              variant="outline"
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    position: 'absolute',
    right: spacing.lg,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  content: {
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  name: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
  },
  email: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  idBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary + '15',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  idText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 1,
  },
  editSection: {
    width: '100%',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  editButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actions: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
});
