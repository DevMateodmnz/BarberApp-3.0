/**
 * ScreenHeader primitive — title + optional subtitle/back/action.
 */
import type { ReactNode } from 'react';
import { Pressable, Text, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { tokens, minTouchTarget } from '@/theme/index.js';

interface ScreenHeaderProps {
  testID?: string;
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightAction?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function ScreenHeader({
  testID,
  title,
  subtitle,
  onBack,
  rightAction,
  style,
}: ScreenHeaderProps) {
  return (
    <View testID={testID} style={[styles.root, style]}>
      <View style={styles.left}>
        {onBack && (
          <Pressable
            onPress={onBack}
            style={styles.backButton}
            hitSlop={minTouchTarget}
            testID={testID ? `${testID}-back` : undefined}
          >
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
        )}
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
      </View>
      {rightAction && <View style={styles.rightAction}>{rightAction}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[3],
    backgroundColor: tokens.colors.background,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing[2],
    flex: 1,
    minWidth: 0,
  },
  backButton: {
    width: minTouchTarget,
    height: minTouchTarget,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    fontSize: tokens.typography.size['2xl'],
    color: tokens.colors.textPrimary,
    fontWeight: tokens.typography.weight.bold,
  },
  title: {
    ...tokens.typography.variant.heading,
    color: tokens.colors.textPrimary,
    flexShrink: 1,
  },
  subtitle: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
    marginTop: tokens.spacing[1],
    flexShrink: 1,
  },
  rightAction: {
    marginLeft: tokens.spacing[2],
    alignSelf: 'flex-start',
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
});
