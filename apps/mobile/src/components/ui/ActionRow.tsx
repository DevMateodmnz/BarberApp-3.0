/**
 * ActionRow primitive — label + action button(s) in a row.
 */
import type { ReactNode } from 'react';
import { Text, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { tokens } from '@/theme/index.js';

interface ActionRowProps {
  testID?: string;
  label: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function ActionRow({ testID, label, children, style }: ActionRowProps) {
  return (
    <View testID={testID} style={[styles.root, style]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.actions}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: tokens.spacing[3],
    paddingHorizontal: tokens.spacing[4],
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.md,
  },
  label: {
    ...tokens.typography.variant.body,
    color: tokens.colors.textPrimary,
    flex: 1,
    marginRight: tokens.spacing[3],
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing[2],
  },
});
