import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { AppState } from 'react-native';
import { auth, db } from '../config/firebase';
import { User, UserRole } from '../types';
import { normalizeForSearch } from '../utils/search';

interface AuthState {
  firebaseUser: FirebaseUser | null;
  userData: User | null;
  role: UserRole | null;
  isAdmin: boolean;
  loading: boolean;
  initialized: boolean;
}

interface AuthContextType extends AuthState {
  setUserData: (data: User | null) => void;
}

const AuthContext = createContext<AuthContextType>({
  firebaseUser: null,
  userData: null,
  role: null,
  isAdmin: false,
  loading: true,
  initialized: false,
  setUserData: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    firebaseUser: null,
    userData: null,
    role: null,
    isAdmin: false,
    loading: true,
    initialized: false,
  });

  // Keep latest firebaseUser in a ref so AppState listener can access it
  const firebaseUserRef = useRef<FirebaseUser | null>(null);

  const loadUserState = async (firebaseUser: FirebaseUser, retries = 3) => {
    try {
      const [userDocResult, tokenResult] = await Promise.allSettled([
        getDoc(doc(db, 'users', firebaseUser.uid)),
        firebaseUser.getIdTokenResult(true),
      ]);

      const isAdmin =
        tokenResult.status === 'fulfilled'
          ? tokenResult.value.claims['admin'] === true
          : false;

      if (userDocResult.status === 'fulfilled' && userDocResult.value.exists()) {
        const userData = { id: userDocResult.value.id, ...userDocResult.value.data() } as User;
        // Auto-heal: legacy accounts may be missing fields added later.
        // We backfill on first load so the user becomes searchable / readable.
        // Fire-and-forget — never blocks the UI; failures are silent.
        const heal: Record<string, unknown> = {};
        if (userData.displayName && !userData.displayNameLower) {
          heal.displayNameLower = normalizeForSearch(userData.displayName);
        }
        if (!('status' in userData) || (userData as any).status == null) {
          heal.status = 'active';
        }
        // Mirror Firebase Auth's emailVerified into Firestore so server
        // triggers (referral claim, etc.) can gate on it without a token.
        if (firebaseUser.emailVerified === true && userData.emailVerified !== true) {
          heal.emailVerified = true;
        }
        // Legacy accounts may be missing `displayId` (introduced after their
        // signup). Generate the same 6-char ID the auth service produces so
        // the referral screen and chat search work for them too.
        if (!userData.displayId) {
          const id = firebaseUser.uid.replace(/[^A-Z0-9]/gi, '').slice(0, 6).toUpperCase();
          if (id) {
            heal.displayId = id;
          }
        }
        if (Object.keys(heal).length > 0) {
          updateDoc(doc(db, 'users', userData.id), heal)
            .then(() => { Object.assign(userData, heal); })
            .catch(() => { /* user may not have permission yet — skip silently */ });
        }
        setState({ firebaseUser, userData, role: userData.role, isAdmin, loading: false, initialized: true });
      } else if (retries > 0) {
        // User doc not found yet (replication delay after registration) — retry
        await new Promise((r) => setTimeout(r, 1000));
        return loadUserState(firebaseUser, retries - 1);
      } else {
        // Exhausted retries — mark initialized so the app can route
        setState({ firebaseUser, userData: null, role: null, isAdmin, loading: false, initialized: true });
      }
    } catch (error) {
      console.error('AuthContext init error:', error);
      setState({ firebaseUser, userData: null, role: null, isAdmin: false, loading: false, initialized: true });
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      firebaseUserRef.current = firebaseUser;
      if (!firebaseUser) {
        setState({
          firebaseUser: null,
          userData: null,
          role: null,
          isAdmin: false,
          loading: false,
          initialized: true,
        });
        return;
      }
      await loadUserState(firebaseUser);
    });

    return unsubscribe;
  }, []);

  // Refresh token when app comes back to foreground so revoked admin claims
  // are detected without requiring a full re-login.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'active' && firebaseUserRef.current) {
        try {
          const token = await firebaseUserRef.current.getIdTokenResult(true);
          const isAdmin = token.claims['admin'] === true;
          setState((prev) => ({ ...prev, isAdmin }));
        } catch {
          // Token refresh failed (offline?) — keep current state
        }
      }
    });
    return () => sub.remove();
  }, []);

  const setUserData = useCallback((data: User | null) => {
    setState((prev) => ({
      ...prev,
      userData: data,
      role: data?.role ?? null,
    }));
  }, []);

  const value = useMemo(() => ({ ...state, setUserData }), [state, setUserData]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
