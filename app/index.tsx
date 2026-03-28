import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import { LoadingScreen } from '../src/components/ui';

export default function Index() {
  const { firebaseUser, userData, role, loading, initialized } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!initialized) return;

    if (!firebaseUser) {
      // Not logged in → auth flow
      router.replace('/(auth)/welcome');
    } else if (!userData) {
      // Logged in but no profile → complete registration
      router.replace('/(auth)/register');
    } else if (role === 'owner') {
      router.replace('/(owner)/home');
    } else if (role === 'trainer') {
      router.replace('/(trainer)/dashboard');
    }
  }, [initialized, firebaseUser, userData, role]);

  return <LoadingScreen />;
}
