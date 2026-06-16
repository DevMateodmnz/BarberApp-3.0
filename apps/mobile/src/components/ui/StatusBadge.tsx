/**
 * StatusBadge primitive — maps appointment statuses to semantic colors.
 */
import { Text, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { tokens } from '@/theme/index.js';
import type { AppointmentStatus } from '@/lib/types.js';

interface StatusBadgeProps {
  testID?: string;
  status: AppointmentStatus | string;
  style?: StyleProp<ViewStyle>;
}

interface StatusConfig {
  background: string;
  text: string;
  label: string;
}

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No Show',
};

const STATUS_CONFIG: Record<
  AppointmentStatus | 'ACTIVE' | 'INACTIVE' | 'UNKNOWN',
  StatusConfig
> = {
  PENDING: { ...tokens.states.pending, label: STATUS_LABELS.PENDING },
  CONFIRMED: { ...tokens.states.confirmed, label: STATUS_LABELS.CONFIRMED },
  IN_PROGRESS: { ...tokens.states.inProgress, label: STATUS_LABELS.IN_PROGRESS },
  COMPLETED: { ...tokens.states.completed, label: STATUS_LABELS.COMPLETED },
  CANCELLED: { ...tokens.states.cancelled, label: STATUS_LABELS.CANCELLED },
  NO_SHOW: { ...tokens.states.noShow, label: STATUS_LABELS.NO_SHOW },
  ACTIVE: { ...tokens.states.active, label: 'Active' },
  INACTIVE: { ...tokens.states.inactive, label: 'Inactive' },
  UNKNOWN: {
    background: tokens.colors.surfaceVariant,
    text: tokens.colors.textSecondary,
    label: 'Unknown',
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
        {config.label}
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
