/**
 * FormSection primitive — groups fields with title and helper text.
 */
import type { ReactNode } from 'react';
import { Text, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { tokens } from '@/theme/index.js';

interface FormSectionProps {
  testID?: string;
  title?: string;
  helper?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function FormSection({ testID, title, helper, children, style }: FormSectionProps) {
  return (
    <View testID={testID} style={[styles.root, style]}>
      {title && <Text style={styles.title}>{title}</Text>}
      {helper && <Text style={styles.helper}>{helper}</Text>}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    marginBottom: tokens.spacing[4],
  },
  title: {
    ...tokens.typography.variant.subheading,
    color: tokens.colors.textPrimary,
    marginBottom: tokens.spacing[2],
    flexShrink: 1,
  },
  helper: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
    marginBottom: tokens.spacing[3],
  },
  content: {
    gap: tokens.spacing[3],
  },
});
