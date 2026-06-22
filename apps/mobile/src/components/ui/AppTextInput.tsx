/**
 * AppTextInput primitive — label, error text, icon support.
 *
 * Focus state is intentionally simple in this foundation: the container uses
 * a static focus-ready border color. JavaScript-driven focus highlighting can
 * be added in a follow-up PR when screens adopt the primitive.
 */
import type { ReactNode } from 'react';
import { Text, TextInput, View, StyleSheet, type StyleProp, type ViewStyle, type TextStyle } from 'react-native';
import type { TextInputProps } from 'react-native';
import { tokens } from '@/theme/index.js';
import { KeyboardAwareScreenContext } from './Screen.js';

interface AppTextInputProps extends Omit<TextInputProps, 'style'> {
  testID?: string;
  label?: string;
  error?: string;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
}

export function AppTextInput({
  testID,
  label,
  error,
  icon,
  style,
  inputStyle,
  placeholder,
  onFocus,
  onBlur,
  ...inputProps
}: AppTextInputProps) {
  return (
    <View testID={testID} style={[styles.root, style]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputContainer,
          !!error && styles.inputError,
        ]}
      >
        {icon && <View style={styles.icon}>{icon}</View>}
        <KeyboardAwareScreenContext.Consumer>
          {(keyboardAwareContext) => (
            <TextInput
              {...inputProps}
              onFocus={(event) => {
                keyboardAwareContext?.onInputFocus(
                  typeof event.target === 'number' ? event.target : null,
                );
                onFocus?.(event);
              }}
              onBlur={(event) => {
                keyboardAwareContext?.onInputBlur(
                  typeof event.target === 'number' ? event.target : null,
                );
                onBlur?.(event);
              }}
              placeholder={placeholder}
              placeholderTextColor={tokens.colors.textMuted}
              style={[styles.input, inputStyle]}
            />
          )}
        </KeyboardAwareScreenContext.Consumer>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
  label: {
    ...tokens.typography.variant.label,
    color: tokens.colors.textSecondary,
    marginBottom: tokens.spacing[2],
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    backgroundColor: tokens.colors.surfaceVariant,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing[3],
  },
  inputError: {
    borderColor: tokens.colors.error,
  },
  icon: {
    marginRight: tokens.spacing[2],
  },
  input: {
    flex: 1,
    ...tokens.typography.variant.body,
    color: tokens.colors.textPrimary,
    paddingVertical: tokens.spacing[3],
  },
  error: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.error,
    marginTop: tokens.spacing[2],
  },
});
