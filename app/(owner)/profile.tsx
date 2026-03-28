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
import { pickAndUploadImage } from '../../src/utils/photo';
import { Button, Avatar, Input } from '../../src/components/ui';
import { colors, spacing, fontSize } from '../../src/theme';

export default function OwnerProfileScreen() {
  const { t } = useTranslation();
  const { firebaseUser, userData, setUserData, isAdmin } = useAuth();
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(userData?.displayName ?? '');
  const [saving, setSaving] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);

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

  const handleChangePhoto = async () => {
    if (!firebaseUser) return;
    setPhotoLoading(true);
    try {
      const url = await pickAndUploadImage(`users/${firebaseUser.uid}/avatar.jpg`);
      if (url) {
        await updateUserProfile(firebaseUser.uid, { photoURL: url });
        setUserData({ ...userData!, photoURL: url });
      }
    } catch (error) {
      Alert.alert(t('common.error'), t('authErrors.generic'));
    } finally {
      setPhotoLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('owner.profile')}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Avatar */}
        <TouchableOpacity onPress={handleChangePhoto} disabled={photoLoading}>
          <Avatar
            uri={userData?.photoURL ?? null}
            name={userData?.displayName ?? '?'}
            size={80}
          />
          <View style={styles.cameraIcon}>
            <Ionicons name="camera" size={16} color={colors.textOnPrimary} />
          </View>
        </TouchableOpacity>

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

        <View style={styles.actions}>
          <Button
            title={t('settings.title')}
            onPress={() => router.push('/(shared)/settings')}
            variant="outline"
          />
          {isAdmin && (
            <Button
              title="Panel de Administración"
              onPress={() => router.push('/(shared)/admin')}
              variant="outline"
            />
          )}
          <Button
            title={t('settings.logout')}
            onPress={handleLogout}
            variant="ghost"
          />
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
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
  },
  content: {
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.primary,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
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
