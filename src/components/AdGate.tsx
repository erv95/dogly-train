import React from 'react';
import { useAuth } from '../contexts/AuthContext';

interface AdGateProps {
  children: React.ReactNode;
  /**
   * If true, renders nothing for premium users (default behavior).
   * If false (rare), renders for everyone — useful for testing.
   */
  hideForPremium?: boolean;
}

/**
 * Wrap any ad component with <AdGate>...</AdGate>.
 * Premium users (isPremium === true) won't see ads.
 *
 * Example:
 *   <AdGate>
 *     <BannerAd unitId="..." />
 *   </AdGate>
 *
 * When the user purchases premium via settings, all ads disappear automatically
 * because AuthContext propagates the updated userData to consumers.
 */
export default function AdGate({ children, hideForPremium = true }: AdGateProps) {
  const { userData } = useAuth();
  const isPremium = userData?.isPremium === true;

  if (hideForPremium && isPremium) return null;
  return <>{children}</>;
}

/**
 * Hook variant for cases where you can't wrap with a component
 * (e.g., to avoid loading an ad SDK at all when premium).
 *
 * Example:
 *   const showAds = useShowAds();
 *   if (showAds) { loadAdSDK(); }
 */
export function useShowAds(): boolean {
  const { userData } = useAuth();
  return userData?.isPremium !== true;
}
