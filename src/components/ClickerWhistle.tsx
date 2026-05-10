import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, spacing, fontSize, borderRadius, shadow } from '../theme';

/**
 * Reusable clicker + whistle component for positive-reinforcement training.
 *
 * Sounds are PRELOADED on mount and replayed via `replayAsync()` for minimum
 * latency on rapid taps (≤50ms target). Audio session is configured to play
 * over iOS silent switch and to duck (not stop) other apps' audio.
 */
export default function ClickerWhistle() {
  const { t } = useTranslation();
  const clickRef = useRef<Audio.Sound | null>(null);
  const whistleRef = useRef<Audio.Sound | null>(null);
  const [ready, setReady] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [whistleCount, setWhistleCount] = useState(0);

  // Press animations — use Animated.Value to avoid re-renders on every tap
  const clickScale = useRef(new Animated.Value(1)).current;
  const whistleScale = useRef(new Animated.Value(1)).current;

  // Preload both sounds + configure audio session
  useEffect(() => {
    let alive = true;
    let click: Audio.Sound | null = null;
    let whistle: Audio.Sound | null = null;

    (async () => {
      try {
        // Audio session — enables override of iOS silent switch
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
          staysActiveInBackground: false,
          interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
          interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
        });

        // Preload sounds in parallel
        const [c, w] = await Promise.all([
          Audio.Sound.createAsync(require('../../assets/sounds/click.wav')),
          Audio.Sound.createAsync(require('../../assets/sounds/whistle.wav')),
        ]);

        if (!alive) {
          c.sound.unloadAsync().catch(() => {});
          w.sound.unloadAsync().catch(() => {});
          return;
        }

        click = c.sound;
        whistle = w.sound;
        clickRef.current = click;
        whistleRef.current = whistle;
        setReady(true);
      } catch (err) {
        console.error('ClickerWhistle: failed to load sounds', err);
      }
    })();

    return () => {
      alive = false;
      click?.unloadAsync().catch(() => {});
      whistle?.unloadAsync().catch(() => {});
      clickRef.current = null;
      whistleRef.current = null;
    };
  }, []);

  const animatePress = useCallback((scale: Animated.Value) => {
    // Quick scale-down + bounce-back
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.9, duration: 50, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleClick = useCallback(async () => {
    if (!clickRef.current) return;
    // Haptic + animation are fire-and-forget so they don't block sound playback
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    animatePress(clickScale);
    setClickCount((n) => n + 1);
    try {
      await clickRef.current.replayAsync();
    } catch {
      // sound may have been unloaded mid-tap (component unmounting)
    }
  }, [animatePress, clickScale]);

  const handleWhistle = useCallback(async () => {
    if (!whistleRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    animatePress(whistleScale);
    setWhistleCount((n) => n + 1);
    try {
      await whistleRef.current.replayAsync();
    } catch {
      // ignore
    }
  }, [animatePress, whistleScale]);

  if (!ready) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>{t('clicker.loading')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.buttonsRow}>
        {/* Clicker */}
        <View style={styles.buttonGroup}>
          <Animated.View style={{ transform: [{ scale: clickScale }] }}>
            <TouchableOpacity
              style={[styles.bigButton, styles.clickButton]}
              onPress={handleClick}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('clicker.clickerLabel')}
              accessibilityHint={t('clicker.clickerHint')}
            >
              <Ionicons name="radio-button-on" size={56} color="#fff" />
            </TouchableOpacity>
          </Animated.View>
          <Text style={styles.buttonName}>{t('clicker.clicker')}</Text>
          <Text style={styles.buttonCount}>
            {clickCount} {t('clicker.taps')}
          </Text>
        </View>

        {/* Whistle */}
        <View style={styles.buttonGroup}>
          <Animated.View style={{ transform: [{ scale: whistleScale }] }}>
            <TouchableOpacity
              style={[styles.bigButton, styles.whistleButton]}
              onPress={handleWhistle}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('clicker.whistleLabel')}
              accessibilityHint={t('clicker.whistleHint')}
            >
              <Ionicons name="notifications" size={56} color="#fff" />
            </TouchableOpacity>
          </Animated.View>
          <Text style={styles.buttonName}>{t('clicker.whistle')}</Text>
          <Text style={styles.buttonCount}>
            {whistleCount} {t('clicker.taps')}
          </Text>
        </View>
      </View>
    </View>
  );
}

const BUTTON_SIZE = 140;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  loadingText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: spacing.xl,
    alignItems: 'center',
  },
  buttonGroup: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  bigButton: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.lg,
  },
  clickButton: {
    backgroundColor: colors.primary,
  },
  whistleButton: {
    backgroundColor: colors.secondary,
  },
  buttonName: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.text,
    marginTop: spacing.sm,
  },
  buttonCount: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
});
