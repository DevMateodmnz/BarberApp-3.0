/**
 * EmptyState primitive — icon + title + message + optional action.
 */
import type { ReactNode } from 'react';
import { Text, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { tokens } from '@/theme/index.js';

interface EmptyStateProps {
  testID?: string;
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({ testID, icon, title, message, action, style }: EmptyStateProps) {
  return (
    <View testID={testID} style={[styles.root, style]}>
      {icon && <View style={styles.icon}>{icon}</View>}
      <Text style={styles.title}>{title}</Text>
      {message && <Text style={styles.message}>{message}</Text>}
      {action && <View style={styles.action}>{action}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacing[6],
  },
  icon: {
    marginBottom: tokens.spacing[3],
  },
  title: {
    ...tokens.typography.variant.subheading,
    color: tokens.colors.textPrimary,
    textAlign: 'center',
  },
  message: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
    marginTop: tokens.spacing[2],
  },
  action: {
    marginTop: tokens.spacing[4],
  },
});
