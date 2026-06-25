/**
 * MoneyText primitive — formatted cents/dollars with currency and color.
 *
 * `PriceText` is exported as a convenience alias for the same component.
 */
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { formatCentsForDisplay } from '@/lib/format.js';

interface MoneyTextProps {
  testID?: string;
  priceCents?: number | null;
  style?: StyleProp<TextStyle>;
}

export function MoneyText({ testID, priceCents, style }: MoneyTextProps) {
  const display =
    priceCents === null || priceCents === undefined
      ? '—'
      : formatCentsForDisplay(priceCents);

  return <Text testID={testID} style={style}>{display}</Text>;
}

/** Alias for `MoneyText`. */
export const PriceText = MoneyText;
