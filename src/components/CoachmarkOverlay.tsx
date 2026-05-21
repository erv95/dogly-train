import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Animated, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCoachmark } from '../contexts/CoachmarkContext';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../theme';

/**
 * Visual layer of the custom coachmark tour (Iter 8.6 Plan B).
 *
 * Renders a full-screen Modal with a dark backdrop, cuts a "hole"
 * around the current step's target using 4 backdrop slabs (top/right/
 * bottom/left of the target rect), and floats a tooltip card either
 * above or below the target depending on available space.
 *
 * Why 4 slabs instead of a real SVG mask: avoiding an extra native dep
 * (react-native-svg) keeps this OTA-deployable. The illusion is identical
 * for rectangular targets, which is all we have.
 *
 * No skip button is rendered — the tour is mandatory per Iter 8 spec.
 * "Next" advances; on the final step the label switches to "Finish".
 */

const TARGET_PADDING = 8;
const TOOLTIP_MARGIN = 12;

export default function CoachmarkOverlay() {
  const { t } = useTranslation();
  const { active, steps, currentIndex, measureTarget, next } = useCoachmark();
  // Recompute on every render so foldables / rotations / split-screen
  // pick up the new dimensions immediately.
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const TOOLTIP_WIDTH = Math.min(SCREEN_W - spacing.lg * 2, 340);
  const [rect, setRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const fade = useState(new Animated.Value(0))[0];

  const step = active ? steps[currentIndex] : null;

  // Re-measure each time the step changes. Retry a couple of times in case
  // the target isn't mounted yet (cross-tab navigation, async render).
  useEffect(() => {
    if (!step) {
      setRect(null);
      fade.setValue(0);
      return;
    }
    let cancelled = false;
    let attempts = 0;

    const tryMeasure = async () => {
      if (cancelled) return;
      if (step.beforeShow) {
        try { await step.beforeShow(); } catch { /* swallow */ }
      }
      // Special targetId "__none__" means "no spotlight — just show the
      // tooltip centered on a dark backdrop". Useful for intro / outro
      // steps that don't point at any specific UI.
      if (step.targetId === '__none__') {
        setRect(null);
        Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
        return;
      }
      // Wait a tick so the navigation can complete its render.
      await new Promise((r) => setTimeout(r, 80));
      if (cancelled) return;
      const r = await measureTarget(step.targetId);
      if (cancelled) return;
      if (r) {
        setRect(r);
        Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      } else if (attempts < 5) {
        attempts += 1;
        setTimeout(tryMeasure, 120);
      } else {
        // Target never appeared — auto-advance so the tour doesn't deadlock.
        next();
      }
    };

    fade.setValue(0);
    setRect(null);
    tryMeasure();
    return () => { cancelled = true; };
  }, [step?.targetId]);

  if (!active || !step) return null;

  const isLast = currentIndex >= steps.length - 1;

  // Compute hole + tooltip positions when we have a measurement.
  // While rect is null we render only the dark backdrop (no hole, no
  // tooltip) so the user briefly sees a darkening flash — better than
  // a frozen tooltip pointing at the wrong place.
  let holeProps: React.ComponentProps<typeof View>[] = [];
  let tooltipTop = SCREEN_H / 2 - 80;
  if (rect) {
    const holeX = Math.max(0, rect.x - TARGET_PADDING);
    const holeY = Math.max(0, rect.y - TARGET_PADDING);
    const holeW = rect.width + TARGET_PADDING * 2;
    const holeH = rect.height + TARGET_PADDING * 2;

    // Build 4 dark slabs around the hole (top, bottom, left, right).
    holeProps = [
      { style: { position: 'absolute', left: 0, top: 0, right: 0, height: holeY, backgroundColor: 'rgba(0,0,0,0.7)' } },
      { style: { position: 'absolute', left: 0, top: holeY + holeH, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)' } },
      { style: { position: 'absolute', left: 0, top: holeY, width: holeX, height: holeH, backgroundColor: 'rgba(0,0,0,0.7)' } },
      { style: { position: 'absolute', left: holeX + holeW, top: holeY, right: 0, height: holeH, backgroundColor: 'rgba(0,0,0,0.7)' } },
    ];

    // Tooltip below the target if it fits, otherwise above.
    const spaceBelow = SCREEN_H - (holeY + holeH);
    const tooltipFitsBelow = spaceBelow >= 200;
    tooltipTop = tooltipFitsBelow
      ? holeY + holeH + TOOLTIP_MARGIN
      : Math.max(TOOLTIP_MARGIN, holeY - 200);
  }

  return (
    <Modal visible transparent statusBarTranslucent animationType="none">
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]} pointerEvents="box-none">
        {rect ? (
          <>
            {holeProps.map((p, i) => (
              <View key={i} pointerEvents="none" {...p} />
            ))}
            {/* Highlight ring around the hole */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: Math.max(0, rect.x - TARGET_PADDING),
                top: Math.max(0, rect.y - TARGET_PADDING),
                width: rect.width + TARGET_PADDING * 2,
                height: rect.height + TARGET_PADDING * 2,
                borderRadius: borderRadius.md,
                borderWidth: 2,
                borderColor: colors.primary,
              }}
            />
          </>
        ) : (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.7)' }]} />
        )}

        <View
          style={[
            styles.tooltip,
            { top: tooltipTop, left: (SCREEN_W - TOOLTIP_WIDTH) / 2, width: TOOLTIP_WIDTH },
          ]}
        >
          <Text style={styles.stepCounter}>{currentIndex + 1} / {steps.length}</Text>
          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.body}>{step.body}</Text>
          <TouchableOpacity
            style={styles.nextBtn}
            onPress={next}
            activeOpacity={0.85}
          >
            <Text style={styles.nextBtnText}>
              {isLast ? t('tutorial.finish') : t('tutorial.next')}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  tooltip: {
    position: 'absolute',
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  stepCounter: {
    fontSize: fontSize.xs,
    fontFamily: fontFamily.semibold,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    fontSize: fontSize.lg,
    fontFamily: fontFamily.bold,
    color: colors.text,
  },
  body: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  nextBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  nextBtnText: {
    color: colors.textOnPrimary,
    fontFamily: fontFamily.bold,
    fontSize: fontSize.md,
  },
});
