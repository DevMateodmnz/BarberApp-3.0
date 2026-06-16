/**
 * ListItem primitive — row with title, subtitle, leading/trailing elements,
 * and optional press handler.
 */
import type { ReactNode } from 'react';
import { Pressable, Text, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { tokens, minTouchTarget } from '@/theme/index.js';

interface ListItemProps {
  testID?: string;
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ListItem({
  testID,
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  disabled = false,
  style,
}: ListItemProps) {
  const content = (
    <View testID={testID} style={[styles.root, style]}>
      {leading && <View style={styles.leading}>{leading}</View>}
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {trailing && <View style={styles.trailing}>{trailing}</View>}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [pressed && styles.pressed]}>
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: minTouchTarget,
    paddingVertical: tokens.spacing[2],
    paddingHorizontal: tokens.spacing[3],
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.md,
  },
  pressed: {
    opacity: 0.8,
  },
  leading: {
    marginRight: tokens.spacing[3],
  },
  content: {
    flex: 1,
  },
  title: {
    ...tokens.typography.variant.body,
    color: tokens.colors.textPrimary,
  },
  subtitle: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
    marginTop: tokens.spacing[1],
  },
  trailing: {
    marginLeft: tokens.spacing[2],
  },
});
