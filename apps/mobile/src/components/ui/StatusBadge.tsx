/**
 * StatusBadge primitive — maps appointment statuses to semantic colors.
 */
import { Text, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { tokens } from '@/theme/index.js';
import type { AppointmentStatus } from '@/lib/types.js';
import { getAppointmentStatusLabel } from '@/i18n/index.js';
import { getStatusLabel } from '@/i18n/helpers.js';

interface StatusBadgeProps {
  testID?: string;
  status: AppointmentStatus | string;
  style?: StyleProp<ViewStyle>;
}

interface StatusConfig {
  background: string;
  text: string;
}

const STATUS_CONFIG: Record<
  AppointmentStatus | 'ACTIVE' | 'INACTIVE' | 'UNKNOWN',
  StatusConfig
> = {
  PENDING: { ...tokens.states.pending },
  CONFIRMED: { ...tokens.states.confirmed },
  IN_PROGRESS: { ...tokens.states.inProgress },
  COMPLETED: { ...tokens.states.completed },
  CANCELLED: { ...tokens.states.cancelled },
  NO_SHOW: { ...tokens.states.noShow },
  ACTIVE: { ...tokens.states.active },
  INACTIVE: { ...tokens.states.inactive },
  UNKNOWN: {
    background: tokens.colors.surfaceVariant,
    text: tokens.colors.textSecondary,
  },
};

function resolveStatusConfig(status: string): StatusConfig {
  const key = status.trim().toUpperCase() as
    | AppointmentStatus
    | 'ACTIVE'
    | 'INACTIVE'
    | 'UNKNOWN';
  return STATUS_CONFIG[key] ?? STATUS_CONFIG.UNKNOWN;
}

export function StatusBadge({ testID, status, style }: StatusBadgeProps) {
  const config = resolveStatusConfig(status);
  const normalized = status.trim().toUpperCase();
  const label =
    normalized === 'ACTIVE' || normalized === 'INACTIVE'
      ? getStatusLabel(normalized)
      : getAppointmentStatusLabel(normalized);

  return (
    <View
      testID={testID}
      style={[
        styles.root,
        { backgroundColor: config.background },
        style,
      ]}
    >
      <Text style={[styles.text, { color: config.text }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignSelf: 'flex-start',
    paddingHorizontal: tokens.spacing[3],
    paddingVertical: tokens.spacing[1],
    borderRadius: tokens.radius.full,
  },
  text: {
    ...tokens.typography.variant.caption,
    fontWeight: tokens.typography.weight.semibold,
  },
});
