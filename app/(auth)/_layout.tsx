import { Stack } from 'expo-router';
import ErrorBoundary from '../../src/components/ErrorBoundary';

export default function AuthLayout() {
  return (
    <ErrorBoundary>
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="language-select" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="welcome" />
      <Stack.Screen name="account-pending" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="complete-profile" />
      <Stack.Screen name="parent-type" />
    </Stack>
    </ErrorBoundary>
  );
}
