/**
 * AppCard primitive — consistent card with default/outlined/elevated variants.
 */
import type { ReactNode } from 'react';
import { Text, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { tokens, shadows } from '@/theme/index.js';

type CardVariant = 'default' | 'outlined' | 'elevated';

interface AppCardProps {
  testID?: string;
  variant?: CardVariant;
  title?: string;
  footer?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function AppCard({
  testID,
  variant = 'default',
  title,
  footer,
  children,
  style,
}: AppCardProps) {
  return (
    <View
      testID={testID}
      style={[
        styles.root,
        variant === 'outlined' && styles.outlined,
        variant === 'elevated' && styles.elevated,
        style,
      ]}
    >
      {title && (
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
        </View>
      )}
      <View style={styles.body}>{children}</View>
      {footer && <View style={styles.footer}>{footer}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing[4],
  },
  outlined: {
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  elevated: {
    ...shadows.md,
  },
  header: {
    marginBottom: tokens.spacing[3],
  },
  title: {
    ...tokens.typography.variant.subheading,
    color: tokens.colors.textPrimary,
  },
  body: {},
  footer: {
    marginTop: tokens.spacing[3],
  },
});
