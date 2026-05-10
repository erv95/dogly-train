import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { LivePathPoint } from '../types';
import { colors } from '../theme';

interface Props {
  path: LivePathPoint[];
  /** Optional starting region — used until we have at least one path point. */
  initialRegion?: { latitude: number; longitude: number };
}

/**
 * Read-only map for the live tracking screen. Centres on the latest path
 * point as it arrives and draws the cumulative polyline.
 */
export function LiveMapView({ path, initialRegion }: Props) {
  const mapRef = useRef<MapView>(null);
  const last = path.length > 0 ? path[path.length - 1] : null;

  useEffect(() => {
    if (!mapRef.current || !last) return;
    mapRef.current.animateCamera(
      { center: { latitude: last.lat, longitude: last.lng } },
      { duration: 600 },
    );
  }, [last?.lat, last?.lng]);

  const region = last
    ? { latitude: last.lat, longitude: last.lng, latitudeDelta: 0.005, longitudeDelta: 0.005 }
    : initialRegion
      ? { ...initialRegion, latitudeDelta: 0.05, longitudeDelta: 0.05 }
      : { latitude: 40.4168, longitude: -3.7038, latitudeDelta: 0.5, longitudeDelta: 0.5 };

  return (
    <View style={styles.wrap}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        initialRegion={region}
        showsUserLocation={false}
        toolbarEnabled={false}
      >
        {path.length > 1 && (
          <Polyline
            coordinates={path.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
            strokeColor={colors.primary}
            strokeWidth={4}
          />
        )}
        {last && (
          <Marker
            coordinate={{ latitude: last.lat, longitude: last.lng }}
            pinColor={colors.primary}
          />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 240,
    overflow: 'hidden',
  },
});
