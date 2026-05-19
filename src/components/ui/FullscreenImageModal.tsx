import React, { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import {
  GestureHandlerRootView,
  PinchGestureHandler,
  TapGestureHandler,
  State,
  type PinchGestureHandlerStateChangeEvent,
  type TapGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const MIN_SCALE = 1;
const MAX_SCALE = 4;

interface Props {
  visible: boolean;
  imageUrl: string | null;
  onClose: () => void;
}

/**
 * Fullscreen image viewer with pinch-to-zoom and double-tap reset. Used in
 * admin to inspect ID verification documents — the inline thumbnails are
 * too small to read DNI/passport text.
 *
 * Tap outside the image (overlay) or hit the X to close. Scale is clamped
 * to [1, 4] so the image can't be flung off-screen.
 */
export default function FullscreenImageModal({ visible, imageUrl, onClose }: Props) {
  const pinchRef = useRef(null);
  const doubleTapRef = useRef(null);

  const baseScale = useRef(new Animated.Value(1)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const scale = Animated.multiply(baseScale, pinchScale);
  const [lastScale, setLastScale] = useState(1);

  const onPinchEvent = Animated.event(
    [{ nativeEvent: { scale: pinchScale } }],
    { useNativeDriver: true },
  );

  const onPinchStateChange = (event: PinchGestureHandlerStateChangeEvent) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, lastScale * event.nativeEvent.scale));
      setLastScale(next);
      baseScale.setValue(next);
      pinchScale.setValue(1);
    }
  };

  const handleDoubleTap = (event: TapGestureHandlerStateChangeEvent) => {
    if (event.nativeEvent.state !== State.ACTIVE) return;
    // If zoomed in at all, reset to 1. Otherwise zoom to 2x.
    const next = lastScale > 1 ? MIN_SCALE : 2;
    setLastScale(next);
    Animated.spring(baseScale, {
      toValue: next,
      useNativeDriver: true,
      friction: 6,
    }).start();
    pinchScale.setValue(1);
  };

  const handleClose = () => {
    // Reset zoom so reopening starts at 1x.
    setLastScale(1);
    baseScale.setValue(1);
    pinchScale.setValue(1);
    onClose();
  };

  if (!imageUrl) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <GestureHandlerRootView style={styles.root}>
        <TouchableWithoutFeedback onPress={handleClose}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>

        <View pointerEvents="box-none" style={styles.imageWrap}>
          <PinchGestureHandler
            ref={pinchRef}
            onGestureEvent={onPinchEvent}
            onHandlerStateChange={onPinchStateChange}
          >
            <Animated.View collapsable={false}>
              <TapGestureHandler
                ref={doubleTapRef}
                numberOfTaps={2}
                onHandlerStateChange={handleDoubleTap}
              >
                <Animated.Image
                  source={{ uri: imageUrl }}
                  style={[styles.image, { transform: [{ scale }] }]}
                  resizeMode="contain"
                />
              </TapGestureHandler>
            </Animated.View>
          </PinchGestureHandler>
        </View>

        <TouchableOpacity style={styles.closeBtn} onPress={handleClose} hitSlop={12}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' },
  overlay: { ...StyleSheet.absoluteFillObject },
  imageWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: SCREEN_W,
    height: SCREEN_H * 0.85,
  },
  closeBtn: {
    position: 'absolute',
    top: 48,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
