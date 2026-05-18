import type { TextStyle } from 'react-native';

/** Tabular numerals — every digit takes equal width, so balance/coin/time
 *  counters don't jump as the value changes. Use this constant instead of
 *  `fontVariant: ['tabular-nums'] as any` (the cast was a workaround for
 *  TextStyle's strict tuple typing in older RN versions). */
export const TABULAR_NUMS: TextStyle['fontVariant'] = ['tabular-nums'];

export const colors = {
  // Primary - warm orange/amber
  primary: '#F5A623',
  primaryDark: '#E8951A',
  primaryLight: '#FFC966',

  // Secondary - deep teal
  secondary: '#2D9CDB',
  secondaryDark: '#2180B9',
  secondaryLight: '#7EC8F0',

  // Backgrounds
  background: '#FFFFFF',
  backgroundSecondary: '#F8F9FA',
  card: '#FFFFFF',

  // Text
  text: '#1A1A2E',
  textSecondary: '#6B7280',
  textLight: '#9CA3AF',
  textOnPrimary: '#FFFFFF',

  // Status
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',

  // Borders
  border: '#E5E7EB',
  borderLight: '#F3F4F6',

  // Special
  boost: '#FFD700',
  star: '#F5A623',
  online: '#10B981',
  offline: '#9CA3AF',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  title: 34,
};

// Inter font variants. Map a semantic weight name to the exact font family
// string registered by @expo-google-fonts/inter in _layout.tsx. Always pair
// fontWeight in StyleSheet with fontFamily — React Native does NOT auto-pick
// the right Inter variant from a numeric weight, you must name it.
export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
};

// Pre-built typography styles for the home screens. Use these instead of
// hand-rolling fontSize + fontFamily on every Text — keeps the visual rhythm
// consistent across owner/trainer/caretaker home.
export const typography = {
  hero: {
    fontFamily: fontFamily.bold,
    fontSize: 28,
    letterSpacing: -0.5,
  },
  heading: {
    fontFamily: fontFamily.semibold,
    fontSize: 22,
    letterSpacing: -0.3,
  },
  sectionLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
  },
  bodyEmphasis: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
  },
  caption: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
  },
  statNumber: {
    fontFamily: fontFamily.bold,
    fontSize: 32,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
};

export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
};

export const COIN_PACKAGES = [
  { id: 'pack_20', coins: 20, price: 1.99, currency: 'USD' },
  { id: 'pack_50', coins: 50, price: 3.99, currency: 'USD' },
  { id: 'pack_100', coins: 100, price: 6.99, currency: 'USD' },
  { id: 'pack_200', coins: 200, price: 11.99, currency: 'USD' },
  { id: 'pack_500', coins: 500, price: 24.99, currency: 'USD' },
];

export const BOOST_COST = 20; // coins
export const BOOST_DURATION_HOURS = 24;

// Premium (remove ads) — one-time purchase
export const PREMIUM_PRICE_EUR = 9.95;
export const PREMIUM_PRICE_CENTS = 995; // for Stripe
export const PREMIUM_CURRENCY = 'EUR';
