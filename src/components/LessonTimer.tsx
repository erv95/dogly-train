import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { colors, spacing, fontSize, borderRadius, shadow } from '../theme';

interface Props {
  /** Recommended duration in minutes (e.g. 5). Falls back to 5 if invalid. */
  durationMinutes: number;
  /** Optional callback fired when the countdown reaches zero. */
  onComplete?: () => void;
}

/**
 * Practice-session countdown timer.
 *
 * - Counts down from `durationMinutes` to 0
 * - Pauses automatically when the component unmounts (no background work)
 * - Tick interval is 100ms so the progress bar animates smoothly
 * - Hapt feedback on finish (no sound — keeps the dog's environment quiet)
 */
export default function LessonTimer({ durationMinutes, onComplete }: Props) {
  const { t } = useTranslation();
  const safeMinutes = Math.max(1, Math.min(60, Math.floor(durationMinutes) || 5));
  const totalMs = safeMinutes * 60 * 1000;

  const [remainingMs, setRemainingMs] = useState(totalMs);
  const [isRunning, setIsRunning] = useState(false);
  const [hasFinished, setHasFinished] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset timer if the duration prop changes (different course opened)
  useEffect(() => {
    setRemainingMs(totalMs);
    setIsRunning(false);
    setHasFinished(false);
  }, [totalMs]);

  // Drive the countdown
  useEffect(() => {
    if (!isRunning) return;

    intervalRef.current = setInterval(() => {
      setRemainingMs((prev) => {
        const next = prev - 100;
        if (next <= 0) {
          // Stop and notify
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          setIsRunning(false);
          setHasFinished(true);
          // Strong double-tap haptic. Falls back silently on devices without haptic engine.
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          onComplete?.();
          return 0;
        }
        return next;
      });
    }, 100);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, onComplete]);

  // Always clean up on unmount (e.g. modal closed)
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  const handlePlayPause = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (hasFinished) {
      // After finish, the play button acts as a reset+start
      setRemainingMs(totalMs);
      setHasFinished(false);
      setIsRunning(true);
      return;
    }
    setIsRunning((r) => !r);
  }, [hasFinished, totalMs]);

  const handleReset = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
    setHasFinished(false);
    setRemainingMs(totalMs);
  }, [totalMs]);

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const mm = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const ss = (totalSeconds % 60).toString().padStart(2, '0');
  const progress = totalMs > 0 ? remainingMs / totalMs : 0;
  const playLabel = hasFinished
    ? t('timer.restart')
    : isRunning
      ? t('timer.pause')
      : remainingMs < totalMs ? t('timer.resume') : t('timer.start');

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {hasFinished ? t('timer.finishedLabel') : t('timer.sessionLabel')}
      </Text>

      {/* Big timer display */}
      <Text style={[styles.display, hasFinished && styles.displayFinished]}>
        {mm}:{ss}
      </Text>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            hasFinished && styles.progressFillFinished,
            { width: `${progress * 100}%` },
          ]}
        />
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary]}
          onPress={handleReset}
          disabled={!isRunning && remainingMs === totalMs}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('timer.reset')}
        >
          <Ionicons
            name="refresh"
            size={20}
            color={(!isRunning && remainingMs === totalMs) ? colors.textLight : colors.textSecondary}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary, hasFinished && styles.btnFinished]}
          onPress={handlePlayPause}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={playLabel}
        >
          <Ionicons
            name={hasFinished ? 'refresh' : isRunning ? 'pause' : 'play'}
            size={24}
            color="#fff"
          />
          <Text style={styles.btnPrimaryText}>{playLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  display: {
    fontSize: 56,
    fontWeight: '900',
    color: colors.text,
    fontVariant: ['tabular-nums'],  // monospaced digits prevent layout shift
    letterSpacing: -1,
  },
  displayFinished: {
    color: colors.success,
  },
  progressTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  progressFillFinished: {
    backgroundColor: colors.success,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: borderRadius.full,
  },
  btnSecondary: {
    width: 48,
    height: 48,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnPrimary: {
    paddingHorizontal: spacing.xl,
    height: 48,
    backgroundColor: colors.primary,
    minWidth: 140,
  },
  btnFinished: {
    backgroundColor: colors.success,
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: fontSize.md,
    fontWeight: '700',
  },
});
