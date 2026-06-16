/**
 * RoleBadge primitive — displays OWNER/BARBER/CLIENT with semantic colors.
 */
import { Text, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { tokens } from '@/theme/index.js';
import type { UserRole } from '@/lib/types.js';

interface RoleBadgeProps {
  testID?: string;
  role: UserRole | string;
  style?: StyleProp<ViewStyle>;
}

interface RoleConfig {
  background: string;
  text: string;
  label: string;
}

const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: 'Owner',
  BARBER: 'Barber',
  CLIENT: 'Client',
};

const ROLE_CONFIG: Record<UserRole | 'UNKNOWN', RoleConfig> = {
  OWNER: {
    background: tokens.colors.primary,
    text: tokens.colors.textInverse,
    label: ROLE_LABELS.OWNER,
  },
  BARBER: {
    background: tokens.colors.info,
    text: tokens.colors.textPrimary,
    label: ROLE_LABELS.BARBER,
  },
  CLIENT: {
    background: tokens.colors.success,
    text: tokens.colors.textInverse,
    label: ROLE_LABELS.CLIENT,
  },
  UNKNOWN: {
    background: tokens.colors.surfaceVariant,
    text: tokens.colors.textSecondary,
    label: 'Unknown',
  },
};

function resolveRoleConfig(role: string): RoleConfig {
  const key = role.trim().toUpperCase() as UserRole | 'UNKNOWN';
  return ROLE_CONFIG[key] ?? ROLE_CONFIG.UNKNOWN;
}

export function RoleBadge({ testID, role, style }: RoleBadgeProps) {
  const config = resolveRoleConfig(role);

  return (
    <View
      testID={testID}
      style={[
        styles.root,
        { backgroundColor: config.background },
        style,
      ]}
    >
      <Text style={[styles.text, { color: config.text }]}>{config.label}</Text>
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
