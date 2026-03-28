import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'AIzaSyDqVgfKTGS7IiLQ1oY2TWW0w-IXIEzUvmo',
  authDomain: 'dogly-train.firebaseapp.com',
  projectId: 'dogly-train',
  storageBucket: 'dogly-train.firebasestorage.app',
  messagingSenderId: '854259014276',
  appId: '1:854259014276:web:5003bea53305facf9c40d1',
};

const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
