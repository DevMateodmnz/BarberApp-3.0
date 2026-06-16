/**
 * BarberApp Mobile — Design tokens.
 *
 * Canonical source of truth for colors, typography, spacing, radius,
 * shadows/elevation, and semantic state colors used by the UI primitives.
 *
 * Tokens are plain TypeScript objects with no runtime overhead so they are
 * tree-shaking friendly and easy to snapshot in tests.
 */

export const colors = {
  background: '#0F0F10',
  surface: '#1A1A1C',
  surfaceVariant: '#232326',
  elevatedSurface: '#2C2C2E',

  textPrimary: '#F5F5F5',
  textSecondary: '#B0B0B0',
  textMuted: '#6E6E73',
  textInverse: '#0F0F10',

  primary: '#D97706',
  primaryLight: '#F59E0B',
  primaryDark: '#B45309',

  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  border: '#2C2C2E',
  divider: '#2C2C2E',
  overlay: 'rgba(0, 0, 0, 0.7)',
  disabled: '#6E6E73',
} as const;

export const typography = {
  size: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
  },
  lineHeight: {
    xs: 16,
    sm: 20,
    base: 24,
    lg: 28,
    xl: 28,
    '2xl': 32,
    '3xl': 36,
    '4xl': 40,
  },
  weight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  variant: {
    title: { fontSize: 36, fontWeight: '700', lineHeight: 40 },
    heading: { fontSize: 30, fontWeight: '700', lineHeight: 36 },
    subheading: { fontSize: 24, fontWeight: '600', lineHeight: 32 },
    body: { fontSize: 16, fontWeight: '400', lineHeight: 24 },
    bodySmall: { fontSize: 14, fontWeight: '400', lineHeight: 20 },
    caption: { fontSize: 12, fontWeight: '400', lineHeight: 16 },
    label: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
    button: { fontSize: 16, fontWeight: '600', lineHeight: 24 },
  },
} as const;

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
  32: 128,
  48: 192,
  64: 256,

  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
  '4xl': 96,
} as const;

export const radius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 24,
  full: 9999,
} as const;

export const shadows = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  xl: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 12,
  },
} as const;

export const states = {
  active: { background: colors.primary, text: colors.textInverse },
  inactive: { background: colors.surfaceVariant, text: colors.textSecondary },
  pending: { background: colors.warning, text: colors.textInverse },
  confirmed: { background: colors.primary, text: colors.textInverse },
  inProgress: { background: colors.info, text: colors.textPrimary },
  completed: { background: colors.success, text: colors.textInverse },
  cancelled: { background: colors.error, text: colors.textPrimary },
  noShow: { background: colors.textMuted, text: colors.textPrimary },
} as const;

export const tokens = {
  colors,
  typography,
  spacing,
  radius,
  shadows,
  states,
} as const;
