import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../src/contexts/AuthContext';
import { useAuth } from '../src/contexts/AuthContext';
import ErrorBoundary from '../src/components/ErrorBoundary';
import { registerPushToken } from '../src/services/notifications';
import '../src/config/i18n';

const queryClient = new QueryClient();

function PushTokenRegistrar() {
  const { firebaseUser, initialized } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (initialized && firebaseUser) {
      registerPushToken(firebaseUser.uid).catch(() => {});
    }
  }, [initialized, firebaseUser?.uid]);

  // Notification tap listener (only in real builds, not Expo Go)
  useEffect(() => {
    if (Constants.appOwnership === 'expo') return;
    if (!initialized || !firebaseUser) return;

    let subscription: any;
    (async () => {
      const Notifications = await import('expo-notifications');

      // App already open: handle tap
      subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        const chatId = response.notification.request.content.data?.chatId as string | undefined;
        if (chatId) {
          router.push(`/(shared)/chat/${chatId}`);
        }
      });

      // App opened from killed state via notification
      const lastResponse = await Notifications.getLastNotificationResponseAsync();
      if (lastResponse) {
        const chatId = lastResponse.notification.request.content.data?.chatId as string | undefined;
        if (chatId) {
          router.push(`/(shared)/chat/${chatId}`);
        }
      }
    })();

    return () => { subscription?.remove(); };
  }, [initialized, firebaseUser?.uid]);

  return null;
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <PushTokenRegistrar />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(owner)" />
            <Stack.Screen name="(trainer)" />
            <Stack.Screen name="(shared)" />
            <Stack.Screen
              name="security"
              options={{ headerShown: true, title: 'Seguridad' }}
            />
          </Stack>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
