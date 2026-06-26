/**
 * AppButton primitive — primary/secondary/ghost/danger variants with sizes,
 * disabled, and loading states.
 */
import {
  ActivityIndicator,
  Pressable,
  Text,
  StyleSheet,
  type AccessibilityRole,
  type AccessibilityState,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { tokens, minTouchTarget } from '@/theme/index.js';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANT_TEXT_COLORS: Record<ButtonVariant, string> = {
  primary: tokens.colors.textInverse,
  secondary: tokens.colors.textPrimary,
  ghost: tokens.colors.primary,
  danger: tokens.colors.textPrimary,
};

interface AppButtonProps {
  testID?: string;
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
  style?: StyleProp<ViewStyle>;
}

export function AppButton({
  testID,
  title,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  loadingText,
  onPress,
  accessibilityLabel,
  accessibilityRole,
  accessibilityState,
  style,
}: AppButtonProps) {
  const isDisabled = disabled || loading;
  const displayTitle = loading && loadingText ? loadingText : title;

  return (
    <Pressable
      testID={testID}
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      style={({ pressed }) => [
        styles.root,
        styles[size],
        styles[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading && <ActivityIndicator size="small" color={tokens.colors.textInverse} style={styles.spinner} />}
      <Text
        style={[
          styles.text,
          { color: isDisabled ? tokens.colors.textMuted : BUTTON_VARIANT_TEXT_COLORS[variant] },
        ]}
      >
        {displayTitle}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.md,
    minHeight: minTouchTarget,
  },
  sm: {
    paddingHorizontal: tokens.spacing[3],
    paddingVertical: tokens.spacing[2],
    minHeight: 36,
  },
  md: {
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[3],
    minHeight: 44,
  },
  lg: {
    paddingHorizontal: tokens.spacing[5],
    paddingVertical: tokens.spacing[4],
    minHeight: 56,
  },
  primary: {
    backgroundColor: tokens.colors.primary,
  },
  secondary: {
    backgroundColor: tokens.colors.surfaceVariant,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  danger: {
    backgroundColor: tokens.colors.error,
  },
  disabled: {
    backgroundColor: tokens.colors.surfaceVariant,
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.9,
  },
  text: {
    ...tokens.typography.variant.button,
    textAlign: 'center',
    flexShrink: 1,
  },
  spinner: {
    marginRight: tokens.spacing[2],
  },
});
