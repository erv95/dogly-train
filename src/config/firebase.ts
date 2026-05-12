import { initializeApp } from 'firebase/app';
// `getReactNativePersistence` is exported by Firebase ≥10.7 at runtime via
// the React Native bundle (selected by Metro), but it's not re-exported by
// `firebase/auth`'s main `index.d.ts`. Suppress the type error here — if
// Firebase fixes the typings in a future release, this directive will start
// to fail and we'll know to remove it.
// @ts-expect-error — runtime export, missing from main type defs (firebase ≥10.7)
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'AIzaSyDqVgfKTGS7IiLQ1oY2TWW0w-IXIEzUvmo',
  authDomain: 'dogly-train.firebaseapp.com',
  projectId: 'dogly-train',
  // EU bucket in europe-west1 (Belgium). Migrated 2026-05-12 from the
  // legacy us-region bucket as part of Iter 1.0 (RGPD residency).
  storageBucket: 'dogly-train-eu',
  messagingSenderId: '854259014276',
  appId: '1:854259014276:web:5003bea53305facf9c40d1',
};

const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

// Persistent local cache enables offline reads from previously-fetched data
// and queues writes while offline (auto-syncs on reconnect).
// `databaseId: 'dogly-eu'` points to the EU multi-region database (eur3).
// The legacy `(default)` DB in nam5 is kept read-only as a 7-day safety net
// before final deletion — see robust-petting-owl.md Iter 1.0 Phase H.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
}, 'dogly-eu');

export const storage = getStorage(app);
export const functions = getFunctions(app);
export default app;
