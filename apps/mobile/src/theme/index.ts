/**
 * BarberApp Mobile — Public theme API.
 *
 * Re-exports all tokens and provides small typed helpers used by the
 * component layer. Keeping helpers here lets tests import the full public
 * API without pulling in React Native unless a component actually needs it.
 */
import type { ViewStyle, TextStyle } from 'react-native';

export * from './tokens.js';

/** Minimum recommended touch target size (points). */
export const minTouchTarget = 44;

/**
 * Typed style-sheet helper.
 *
 * React Native's `StyleSheet.create` is already typed, but this identity
 * helper lets tests and utility modules create typed style objects without
 * importing the entire `react-native` runtime.
 */
export function createStyles<T extends Record<string, ViewStyle | TextStyle>>(styles: T): T {
  return styles;
}
