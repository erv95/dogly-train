import { useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../contexts/AuthContext';

/**
 * Centralised hook for haptic feedback. All call-sites should go through here so
 * the user's `preferences.disableHaptics` setting is honoured uniformly.
 *
 * - `tap`     → light selection feedback (button taps, copy-to-clipboard, etc).
 * - `success` → positive milestone (booking confirmed, level-up, purchase ok).
 * - `warning` → reversible negative action (cancel booking).
 * - `error`   → unrecoverable failure (network error, validation reject).
 */
export function useHaptics() {
  const { userData } = useAuth();
  const disabled = userData?.preferences?.disableHaptics === true;

  const tap = useCallback(() => {
    if (disabled) return;
    Haptics.selectionAsync().catch(() => {});
  }, [disabled]);

  const success = useCallback(() => {
    if (disabled) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [disabled]);

  const warning = useCallback(() => {
    if (disabled) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, [disabled]);

  const error = useCallback(() => {
    if (disabled) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  }, [disabled]);

  return { tap, success, warning, error };
}
