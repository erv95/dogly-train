import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Request permission and get the Expo push token.
 * Saves the token to Firestore so Cloud Functions can send notifications.
 *
 * Uses dynamic imports so expo-notifications is never loaded in Expo Go
 * (remote push was removed from Expo Go in SDK 53).
 */
export async function registerPushToken(userId: string): Promise<void> {
  // Remote push tokens not supported in Expo Go since SDK 53
  if (Constants.appOwnership === 'expo') return;

  const Device = await import('expo-device');
  if (!Device.isDevice) return;

  // Lazy-load so the module never initializes in Expo Go
  const Notifications = await import('expo-notifications');

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const token = (await Notifications.getExpoPushTokenAsync()).data;
  await updateDoc(doc(db, 'users', userId), { fcmToken: token });
}
