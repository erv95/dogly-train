import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme';
import { useAuth } from '../../src/contexts/AuthContext';
import { subscribeToUnreadCount } from '../../src/services/chats';
import { updateUserPreferences } from '../../src/services/users';
import EmailVerificationBanner from '../../src/components/EmailVerificationBanner';
import { CoachmarkProvider, useCoachmark, CoachmarkStepDef } from '../../src/contexts/CoachmarkContext';
import CoachmarkOverlay from '../../src/components/CoachmarkOverlay';

/** Reads i18n + AuthContext to build the 5 mandatory tutorial steps.
 *  Steps 1-3 spotlight elements on the Today tab; steps 4-5 are
 *  generic info cards (no spotlight) — covering Tabs nav + closing. */
function buildTutorialSteps(t: (key: string) => string): CoachmarkStepDef[] {
  return [
    { targetId: 'today-rail',  title: t('tutorial.step1.title'), body: t('tutorial.step1.body') },
    { targetId: 'today-coins', title: t('tutorial.step2.title'), body: t('tutorial.step2.body') },
    { targetId: '__none__',    title: t('tutorial.step3.title'), body: t('tutorial.step3.body') },
    { targetId: '__none__',    title: t('tutorial.step4.title'), body: t('tutorial.step4.body') },
    { targetId: '__none__',    title: t('tutorial.step5.title'), body: t('tutorial.step5.body') },
  ];
}

/** Inner component that has access to the Coachmark context. Decides when
 *  to auto-start the tour for new owners.
 *
 *  Source of truth is Firestore (`user.preferences.tutorialCompleted`). No
 *  AsyncStorage gate — an earlier draft had one and it caused per-device
 *  cross-contamination (one user's completion blocked the tour for any
 *  later account on the same Expo Go install). Relying solely on the
 *  AuthContext-hydrated Firestore data also means user A completing the
 *  tour doesn't suppress user B's tour after a logout/login on the same
 *  device. */
function TutorialAutoStarter() {
  const { t } = useTranslation();
  const { firebaseUser, userData, setUserData, role } = useAuth();
  const { start, active } = useCoachmark();
  // Belt-and-braces guard: a useRef inside the component + a module-level
  // flag below. The useRef survives renders; the module-level survives
  // component remounts within the same JS runtime (e.g. cross-group
  // navigation re-mounting the owner layout). Both reset on full app reload.
  const tourStartedRef = useRef(false);

  useEffect(() => {
    if (!userData || !firebaseUser) return;
    if (role !== 'owner') return;
    if (userData.preferences?.tutorialCompleted === true) return;
    if (!userData.preferences?.parentType) return; // wait for parent-type
    if (active) return; // already running
    if (tourStartedRef.current) return; // ref-level lock
    if (moduleTourStartedFor === firebaseUser.uid) return; // module-level lock
    tourStartedRef.current = true;
    moduleTourStartedFor = firebaseUser.uid;

    // Optimistic burn-the-boats: mark tutorialCompleted=true BEFORE the
    // tour starts so the gate above evaluates to true on the very next
    // render. This is the only way to be safe against the
    // "active false-true race" the user reported — relying on the
    // post-finish callback wasn't enough because the Firestore round trip
    // takes ~150-500ms during which the gate is briefly open again.
    // Trade-off: a user that kills the app mid-tour never sees it again.
    // That's acceptable for a 5-step onboarding (it can be replayed from
    // Settings later when 8.6.5 ships).
    setUserData({
      ...userData,
      preferences: { ...(userData.preferences ?? {}), tutorialCompleted: true },
    });
    updateUserPreferences(firebaseUser.uid, { tutorialCompleted: true })
      .catch((err) => console.warn('[tutorial] persist failed', err));

    start(buildTutorialSteps(t));
  }, [userData, firebaseUser, role, active, start, t, setUserData]);

  return null;
}

// Module-level lock: survives component re-mounts within the same JS runtime.
// Keyed by uid so a logout+login as a different owner still gets their tour.
let moduleTourStartedFor: string | null = null;

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
    <CoachmarkProvider>
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.warning }}>
        <EmailVerificationBanner />
      </SafeAreaView>
      <View style={{ flex: 1 }}>
      <TutorialAutoStarter />
      <CoachmarkOverlay />
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
    </CoachmarkProvider>
  );
}
