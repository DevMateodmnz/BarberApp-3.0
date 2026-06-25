import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { minTouchTarget, tokens } from '@/theme/index.js';

interface NavigationTileProps {
  testID?: string;
  title: string;
  description?: string;
  iconName: string;
  onPress: () => void;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'primary';
  showChevron?: boolean;
}

export function NavigationTile({
  testID,
  title,
  description,
  iconName,
  onPress,
  accessibilityLabel,
  style,
  variant = 'default',
  showChevron = false,
}: NavigationTileProps) {
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.root,
        isPrimary ? styles.rootPrimary : styles.rootDefault,
        pressed && styles.pressed,
        style,
      ]}
    >
      <View style={styles.headerRow}>
        <View style={[styles.iconContainer, isPrimary ? styles.iconContainerPrimary : styles.iconContainerDefault]}>
          <Ionicons
            color={isPrimary ? tokens.colors.textInverse : tokens.colors.primaryLight}
            name={iconName as never}
            size={20}
          />
        </View>

        <View style={styles.titleBlock}>
          <Text style={[styles.title, isPrimary && styles.titlePrimary]}>{title}</Text>
          {description ? (
            <Text style={[styles.description, isPrimary && styles.descriptionPrimary]}>{description}</Text>
          ) : null}
        </View>

        {showChevron ? (
          <Ionicons
            color={isPrimary ? tokens.colors.textInverse : tokens.colors.textSecondary}
            name="chevron-forward"
            size={18}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: tokens.radius.xl,
    borderWidth: 1,
    minHeight: minTouchTarget * 2,
    paddingHorizontal: tokens.layout.sectionContentGap,
    paddingVertical: tokens.layout.sectionContentGap,
  },
  rootDefault: {
    backgroundColor: tokens.colors.surface,
    borderColor: tokens.colors.border,
  },
  rootPrimary: {
    backgroundColor: tokens.colors.primaryDark,
    borderColor: tokens.colors.primaryLight,
  },
  pressed: {
    opacity: 0.9,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: tokens.layout.relatedCardGap,
  },
  iconContainer: {
    alignItems: 'center',
    borderRadius: tokens.radius.full,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  iconContainerDefault: {
    backgroundColor: tokens.colors.surfaceVariant,
  },
  iconContainerPrimary: {
    backgroundColor: tokens.colors.primary,
  },
  titleBlock: {
    flex: 1,
    gap: tokens.spacing[1],
    minWidth: 0,
  },
  title: {
    ...tokens.typography.variant.label,
    color: tokens.colors.textPrimary,
    flexShrink: 1,
  },
  titlePrimary: {
    color: tokens.colors.textPrimary,
  },
  description: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
    flexShrink: 1,
  },
  descriptionPrimary: {
    color: '#FDE7C3',
  },
});
