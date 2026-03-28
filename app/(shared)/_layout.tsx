import { Stack } from 'expo-router';
import { colors } from '../../src/theme';

export default function SharedLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: colors.primary,
        headerStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="chat/[id]" options={{ title: 'Chat' }} />
      <Stack.Screen name="trainer/[id]" options={{ title: 'Trainer' }} />
      <Stack.Screen name="review/[trainerId]" options={{ title: 'Review' }} />
      <Stack.Screen name="dog-form" options={{ title: 'Dog' }} />
      <Stack.Screen name="purchase" options={{ title: 'Purchase' }} />
      <Stack.Screen name="admin" options={{ headerShown: false }} />
    </Stack>
  );
}
