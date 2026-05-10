import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { colors } from '../../src/theme';
import { useAuth } from '../../src/contexts/AuthContext';

export default function SharedLayout() {
  const { initialized, firebaseUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (initialized && !firebaseUser) {
      router.replace('/');
    }
  }, [initialized, firebaseUser]);

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: colors.primary,
        headerStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[id]" options={{ title: 'Chat' }} />
      <Stack.Screen name="trainer/[id]" options={{ title: 'Trainer' }} />
      <Stack.Screen name="caretaker/[id]" options={{ title: 'Caretaker' }} />
      <Stack.Screen name="review/[trainerId]" options={{ title: 'Review' }} />
      <Stack.Screen name="dog-form" options={{ title: 'Dog' }} />
      <Stack.Screen name="purchase" options={{ title: 'Purchase' }} />
      <Stack.Screen name="admin" options={{ headerShown: false }} />
      <Stack.Screen name="transactions" options={{ title: 'Transactions' }} />
      <Stack.Screen name="courses" options={{ headerShown: false }} />
      <Stack.Screen name="clicker" options={{ title: 'Clicker' }} />
      <Stack.Screen name="dog-health/[dogId]" options={{ title: 'Salud' }} />
      <Stack.Screen name="training-prefs/[dogId]" options={{ title: 'Plan personalizado' }} />
      <Stack.Screen name="behavior-guides/index" options={{ title: 'Guías' }} />
      <Stack.Screen name="behavior-guides/[issueId]" options={{ title: 'Guía' }} />
      <Stack.Screen name="emergency" options={{ title: 'Emergencias', headerTintColor: '#EF4444' }} />
      <Stack.Screen name="emergency-protocol/[id]" options={{ title: 'Protocolo', headerTintColor: '#EF4444' }} />
      <Stack.Screen name="places/index" options={{ title: 'Lugares' }} />
      <Stack.Screen name="places/[id]" options={{ title: 'Lugar' }} />
      <Stack.Screen name="place-form" options={{ title: 'Proponer lugar' }} />
      <Stack.Screen name="walk-tracker/[dogId]" options={{ title: 'Tracker' }} />
      <Stack.Screen name="walk/[walkId]" options={{ title: 'Paseo' }} />
      <Stack.Screen name="weekly-plan/[dogId]" options={{ title: 'Plan semanal' }} />
      <Stack.Screen name="breed-identifier/[dogId]" options={{ title: 'Identificador IA' }} />
      <Stack.Screen name="challenges/index" options={{ title: 'Retos' }} />
      <Stack.Screen name="challenges/[challengeId]" options={{ title: 'Reto' }} />
      <Stack.Screen name="identity-verification" options={{ title: 'Verificación de identidad' }} />
      <Stack.Screen name="availability" options={{ title: 'Mi agenda' }} />
      <Stack.Screen name="bookings/[id]" options={{ title: 'Reserva' }} />
      <Stack.Screen name="book/[providerId]" options={{ title: 'Reservar' }} />
      <Stack.Screen name="referrals" options={{ title: 'Referidos' }} />
      <Stack.Screen name="live-session/[bookingId]" options={{ title: 'En vivo' }} />
    </Stack>
  );
}
