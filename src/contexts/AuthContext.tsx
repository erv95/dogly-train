import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { User, UserRole } from '../types';

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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            const userData = { id: userDoc.id, ...userDoc.data() } as User;
            setState({
              firebaseUser,
              userData,
              role: userData.role,
              isAdmin: false,
              loading: false,
              initialized: true,
            });
          } else {
            setState({
              firebaseUser,
              userData: null,
              role: null,
              isAdmin: false,
              loading: false,
              initialized: true,
            });
          }
          // Check admin claim separately (non-blocking)
          firebaseUser.getIdTokenResult(true).then((tokenResult) => {
            const isAdmin = tokenResult.claims['admin'] === true;
            if (isAdmin) {
              setState((prev) => ({ ...prev, isAdmin: true }));
            }
          }).catch(() => {});
        } catch (error) {
          console.error('Error fetching user profile:', error);
          setState({
            firebaseUser,
            userData: null,
            role: null,
            isAdmin: false,
            loading: false,
            initialized: true,
          });
        }
      } else {
        // User is signed out
        setState({
          firebaseUser: null,
          userData: null,
          role: null,
          loading: false,
          initialized: true,
        });
      }
    });

    return unsubscribe;
  }, []);

  const setUserData = (data: User | null) => {
    setState((prev) => ({
      ...prev,
      userData: data,
      role: data?.role ?? null,
    }));
  };

  return (
    <AuthContext.Provider value={{ ...state, setUserData }}>
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
