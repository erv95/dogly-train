import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

/**
 * In-app guided-tour state container (Iter 8.6, Plan B custom).
 *
 * Built from scratch instead of pulling react-native-copilot because:
 *  - The lib's compat with Expo SDK 54 + expo-router Tabs is undocumented.
 *  - It would add a native dep, forcing a new build before testers see it.
 *  - The behavioral requirements (mandatory, no skip, persist, replay) are
 *    simple enough that a 200-line implementation gives us more control.
 *
 * How it works:
 *  - A `<CoachmarkProvider>` lives high in the owner layout (above any
 *    screen that has a step target).
 *  - Each highlighted element wraps itself in `<CoachmarkTarget id="…">`,
 *    which registers a ref + a `measureInWindow` getter with the context.
 *  - `start(steps)` kicks off the tour with an ordered list of `{ id,
 *    title, body }`. The provider renders an overlay with a spotlight
 *    hole around the current target and a tooltip with title/body/next.
 *  - `finish()` calls the consumer's `onFinish` callback so the caller
 *    can persist `tutorialCompleted: true` to Firestore.
 *
 * Notes:
 *  - "No skip" is enforced by simply not exposing a skip handler in the
 *    overlay UI (defined in CoachmarkOverlay.tsx).
 *  - If a target id is registered AFTER `start()` is called (e.g. lazy
 *    tab), the overlay waits up to ~500ms before advancing. After that
 *    it auto-skips the step rather than blocking the user forever.
 */

export interface CoachmarkStepDef {
  /** Logical id of the highlighted element. Must match a CoachmarkTarget id. */
  targetId: string;
  /** Heading shown in the tooltip. Translated key resolved by caller. */
  title: string;
  /** One-paragraph body shown in the tooltip. Translated. */
  body: string;
  /** Optional: before showing this step, run this side effect (e.g.
   *  navigate to a different tab). Returns a promise so cross-screen
   *  transitions can complete before measureInWindow runs. */
  beforeShow?: () => Promise<void> | void;
}

interface TargetEntry {
  ref: React.RefObject<View | null>;
}

interface CoachmarkState {
  active: boolean;
  steps: CoachmarkStepDef[];
  currentIndex: number;
}

interface ContextValue extends CoachmarkState {
  registerTarget: (id: string, ref: React.RefObject<View | null>) => void;
  unregisterTarget: (id: string) => void;
  measureTarget: (id: string) => Promise<{ x: number; y: number; width: number; height: number } | null>;
  start: (steps: CoachmarkStepDef[], onFinish?: () => void) => void;
  next: () => void;
  finish: () => void;
}

const CoachmarkContext = createContext<ContextValue | null>(null);

export function CoachmarkProvider({ children }: { children: React.ReactNode }) {
  const targets = useRef<Map<string, TargetEntry>>(new Map());
  const onFinishRef = useRef<(() => void) | undefined>(undefined);
  const [state, setState] = useState<CoachmarkState>({
    active: false,
    steps: [],
    currentIndex: 0,
  });

  const registerTarget = useCallback((id: string, ref: React.RefObject<View | null>) => {
    targets.current.set(id, { ref });
  }, []);

  const unregisterTarget = useCallback((id: string) => {
    targets.current.delete(id);
  }, []);

  const measureTarget = useCallback(
    (id: string): Promise<{ x: number; y: number; width: number; height: number } | null> =>
      new Promise((resolve) => {
        const entry = targets.current.get(id);
        const node = entry?.ref.current;
        if (!node || typeof node.measureInWindow !== 'function') {
          resolve(null);
          return;
        }
        node.measureInWindow((x, y, width, height) => {
          if (x === undefined || y === undefined) resolve(null);
          else resolve({ x, y, width, height });
        });
      }),
    [],
  );

  const start = useCallback((steps: CoachmarkStepDef[], onFinish?: () => void) => {
    onFinishRef.current = onFinish;
    setState({ active: true, steps, currentIndex: 0 });
  }, []);

  const next = useCallback(() => {
    setState((prev) => {
      const lastIndex = prev.steps.length - 1;
      if (prev.currentIndex >= lastIndex) {
        // Finishing — fire callback outside the setState to keep it pure.
        queueMicrotask(() => onFinishRef.current?.());
        return { active: false, steps: [], currentIndex: 0 };
      }
      return { ...prev, currentIndex: prev.currentIndex + 1 };
    });
  }, []);

  const finish = useCallback(() => {
    queueMicrotask(() => onFinishRef.current?.());
    setState({ active: false, steps: [], currentIndex: 0 });
  }, []);

  const value = useMemo<ContextValue>(
    () => ({
      ...state,
      registerTarget,
      unregisterTarget,
      measureTarget,
      start,
      next,
      finish,
    }),
    [state, registerTarget, unregisterTarget, measureTarget, start, next, finish],
  );

  return <CoachmarkContext.Provider value={value}>{children}</CoachmarkContext.Provider>;
}

export function useCoachmark() {
  const ctx = useContext(CoachmarkContext);
  if (!ctx) throw new Error('useCoachmark must be used within CoachmarkProvider');
  return ctx;
}
