import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { pickAndUploadImage } from '../utils/photo';

/**
 * Centralised "change / remove profile photo" hook. Used by every my-profile
 * screen (owner, trainer, caretaker) so the UX is uniform and a bug fix lands
 * in a single file.
 *
 * The hook is role-agnostic — the caller injects the role-specific update fn
 * (e.g. updateUserProfile / updateTrainerProfile / updateCaretakerProfile)
 * via the `updateProfile` parameter.
 *
 * UI pattern when a photo already exists: Alert with 3 choices (change / remove
 * / cancel). When there's no photo yet: open the picker directly.
 */

export interface UseProfilePhotoArgs {
  /** Current photo URL on the user doc (null if no photo set yet). */
  currentPhoto: string | null | undefined;
  /** Persist the new photoURL value to the user/profile doc. */
  updateProfile: (patch: { photoURL: string | null }) => Promise<void>;
  /** Optional callback fired after a successful update so the screen can
   *  refresh its local copy of userData. */
  onUpdated?: (newUrl: string | null) => void;
}

export interface UseProfilePhotoResult {
  loading: boolean;
  /** Tap handler: shows the Alert if a photo exists, otherwise opens the
   *  image picker straight away. */
  handleChange: () => void;
}

export function useProfilePhoto({
  currentPhoto,
  updateProfile,
  onUpdated,
}: UseProfilePhotoArgs): UseProfilePhotoResult {
  const { firebaseUser } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const doPick = useCallback(async () => {
    if (!firebaseUser) return;
    setLoading(true);
    try {
      const url = await pickAndUploadImage(`users/${firebaseUser.uid}/avatar.jpg`);
      if (url) {
        await updateProfile({ photoURL: url });
        onUpdated?.(url);
      }
    } catch {
      Alert.alert(t('common.error'), t('authErrors.generic'));
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, updateProfile, onUpdated, t]);

  const doRemove = useCallback(async () => {
    if (!firebaseUser) return;
    setLoading(true);
    try {
      await updateProfile({ photoURL: null });
      onUpdated?.(null);
    } catch {
      Alert.alert(t('common.error'), t('authErrors.generic'));
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, updateProfile, onUpdated, t]);

  const handleChange = useCallback(() => {
    if (currentPhoto) {
      Alert.alert(t('profile.photoTitle'), t('profile.photoOptionalHint'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('profile.photoRemove'), style: 'destructive', onPress: doRemove },
        { text: t('profile.photoChange'), onPress: doPick },
      ]);
    } else {
      doPick();
    }
  }, [currentPhoto, t, doPick, doRemove]);

  return { loading, handleChange };
}
