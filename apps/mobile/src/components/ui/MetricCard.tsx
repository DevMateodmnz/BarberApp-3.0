/**
 * MetricCard primitive — big number + label + optional trend.
 */
import { Text, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { tokens } from '@/theme/index.js';

interface MetricCardTrend {
  value: number;
  isPositive: boolean;
}

interface MetricCardProps {
  testID?: string;
  value: string | number;
  label: string;
  trend?: MetricCardTrend;
  style?: StyleProp<ViewStyle>;
}

export function MetricCard({ testID, value, label, trend, style }: MetricCardProps) {
  const trendSign = trend?.isPositive ? '+' : '-';
  const trendColor = trend?.isPositive ? tokens.colors.success : tokens.colors.error;

  return (
    <View testID={testID} style={[styles.root, style]}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
      {trend && (
        <Text style={[styles.trend, { color: trendColor }]}>
          {trendSign}{trend.value}%
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing[4],
  },
  value: {
    ...tokens.typography.variant.heading,
    color: tokens.colors.textPrimary,
  },
  label: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
    marginTop: tokens.spacing[1],
  },
  trend: {
    ...tokens.typography.variant.caption,
    fontWeight: tokens.typography.weight.semibold,
    marginTop: tokens.spacing[2],
  },
});
