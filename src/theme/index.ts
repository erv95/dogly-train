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
