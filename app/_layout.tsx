import React, { useEffect } from 'react';
import { Text } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
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
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Apply Inter as the default font for every <Text> in the app. Components
  // that opt into a specific weight (semibold/bold) still set their own
  // fontFamily via theme.fontFamily.* — this only affects unstyled text.
  useEffect(() => {
    if (!fontsLoaded) return;
    const TextWithDefault = Text as any;
    const previous = TextWithDefault.defaultProps?.style;
    TextWithDefault.defaultProps = {
      ...(TextWithDefault.defaultProps || {}),
      style: [{ fontFamily: 'Inter_400Regular' }, previous].filter(Boolean),
    };
  }, [fontsLoaded]);

  // Block the splash until Inter is ready — otherwise the first render
  // flashes system font and then snaps to Inter, which looks janky.
  if (!fontsLoaded) return null;

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
