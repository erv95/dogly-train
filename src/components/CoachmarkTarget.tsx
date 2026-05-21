import React, { useEffect, useRef } from 'react';
import { View, ViewProps } from 'react-native';
import { useCoachmark } from '../contexts/CoachmarkContext';

/**
 * Wrap any element you want to highlight during the tour. The id must
 * match the `targetId` of the corresponding `CoachmarkStepDef`.
 *
 * Implementation note: we keep the wrapper a plain View instead of a
 * `collapsable={false}` patch because React Native already retains a
 * native node for any View that has children — `measureInWindow` works
 * out of the box. If a future step needs to highlight a Text directly,
 * add `collapsable={false}` to its parent View.
 */
interface Props extends ViewProps {
  id: string;
  children: React.ReactNode;
}

export default function CoachmarkTarget({ id, children, ...rest }: Props) {
  const ref = useRef<View>(null);
  const { registerTarget, unregisterTarget } = useCoachmark();

  useEffect(() => {
    registerTarget(id, ref);
    return () => unregisterTarget(id);
  }, [id, registerTarget, unregisterTarget]);

  return (
    <View ref={ref} collapsable={false} {...rest}>
      {children}
    </View>
  );
}
