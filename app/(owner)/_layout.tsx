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
      {/* Order matters: first Tabs.Screen is the default landing tab for
          owners. Iter 8.3 places `today` (puppy daily plan) first so new
          puppy parents land on their plan, not the marketplace. */}
      <Tabs.Screen
        name="today"
        options={{
          title: t('owner.todayTab'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="sunny-outline" size={size} color={color} />
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
        name="courses"
        options={{
          title: t('owner.coursesTab'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="school" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="home"
        options={{
          title: t('owner.findProsTab'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search" size={size} color={color} />
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
        name="profile"
        options={{
          title: t('owner.profile'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
      {/* Bookings moved off the tab bar (Iter 8.3). Still reachable via
          profile.tsx "My bookings" button and via the upcoming-booking card
          inside Today's DailyTipsRail. */}
      <Tabs.Screen
        name="bookings"
        options={{ href: null }}
      />
    </Tabs>
      </View>
    </View>
  );
}
