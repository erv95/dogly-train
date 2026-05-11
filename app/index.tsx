import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../src/contexts/AuthContext';
import { LoadingScreen } from '../src/components/ui';
import i18n from '../src/config/i18n';

export default function Index() {
  const { firebaseUser, userData, role, initialized } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!initialized) return;

    const navigate = async () => {
      // First launch check
      const langSelected = await AsyncStorage.getItem('@dogly_lang_selected');
      if (!langSelected) {
        router.replace('/(auth)/language-select');
        return;
      }

      // Restore saved language
      const savedLang = await AsyncStorage.getItem('@dogly_language');
      if (savedLang && savedLang !== i18n.language) {
        await i18n.changeLanguage(savedLang);
      }

      // Onboarding gate — only shown to logged-out users on first run.
      // Authenticated users skip it (they already saw it before).
      const onboarded = await AsyncStorage.getItem('@dogly_onboarded');
      if (!firebaseUser && !onboarded) {
        router.replace('/(auth)/onboarding');
        return;
      }

      if (!firebaseUser) {
        router.replace('/(auth)/welcome');
      } else if (!userData) {
        // User authenticated but profile doc missing — happens when registration
        // was interrupted before the questionnaire finished. Send them straight
        // to complete-profile with the existing Auth credentials so they can
        // pick up where they left off (instead of being signed out and stuck).
        router.replace({
          pathname: '/(auth)/complete-profile',
          params: {
            uid: firebaseUser.uid,
            email: firebaseUser.email ?? '',
            displayName: firebaseUser.displayName ?? '',
          },
        });
      } else if (userData.status === 'pending_deletion') {
        // Account in 30-day soft-delete grace window. Block in-app routes
        // until the user either restores or signs out.
        router.replace('/(auth)/account-pending');
      } else if (role === 'owner') {
        router.replace('/(owner)/home');
      } else if (role === 'trainer') {
        router.replace('/(trainer)/dashboard');
      } else if (role === 'caretaker') {
        router.replace('/(caretaker)/dashboard');
      }
    };

    navigate();
  }, [initialized, firebaseUser, userData, role]);

  return <LoadingScreen />;
}
