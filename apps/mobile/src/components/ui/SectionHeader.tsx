/**
 * SectionHeader primitive — section title with optional action.
 */
import type { ReactNode } from 'react';
import { Text, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { tokens } from '@/theme/index.js';

interface SectionHeaderProps {
  testID?: string;
  title: string;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function SectionHeader({ testID, title, action, style }: SectionHeaderProps) {
  return (
    <View testID={testID} style={[styles.root, style]}>
      <Text style={styles.title}>{title}</Text>
      {action && <View style={styles.action}>{action}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tokens.spacing[3],
  },
  title: {
    ...tokens.typography.variant.subheading,
    color: tokens.colors.textPrimary,
    flex: 1,
    flexShrink: 1,
  },
  action: {
    marginLeft: tokens.spacing[2],
  },
});
