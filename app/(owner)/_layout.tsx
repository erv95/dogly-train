import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme';
import { useAuth } from '../../src/contexts/AuthContext';
import { subscribeToUnreadCount } from '../../src/services/chats';
import EmailVerificationBanner from '../../src/components/EmailVerificationBanner';

export default function OwnerLayout() {
  const { t } = useTranslation();
  const { firebaseUser } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = subscribeToUnreadCount(firebaseUser.uid, setUnreadCount);
    return unsub;
  }, [firebaseUser?.uid]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.warning }}>
        <EmailVerificationBanner />
      </SafeAreaView>
      <View style={{ flex: 1 }}>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textLight,
        tabBarShowLabel: false,
        tabBarStyle: {
          borderTopColor: colors.borderLight,
        },
        tabBarItemStyle: { paddingVertical: 8 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t('owner.home'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="dogs"
        options={{
          title: t('owner.myDogs'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="paw" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: t('bookings.list.title'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: t('owner.chats'),
          tabBarBadge: unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.primary },
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="courses"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('owner.profile'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
      </View>
    </View>
  );
}
