/**
 * Screen primitive — safe-area-aware root container.
 *
 * Provides consistent background, flex layout, and optional scrollability
 * so every screen starts from the same visual foundation.
 */
import type { ReactElement, ReactNode } from 'react';
import { ScrollView, StyleSheet, type RefreshControlProps, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '@/theme/index.js';

interface ScreenProps {
  testID?: string;
  scrollable?: boolean;
  refreshControl?: ReactElement<RefreshControlProps>;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Screen({ testID, scrollable = false, refreshControl, children, style }: ScreenProps) {
  const content = scrollable ? (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      testID={testID ? `${testID}-scroll` : undefined}
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  ) : (
    children
  );

  return (
    <SafeAreaView testID={testID} style={[styles.root, style]}>
      {content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: tokens.spacing[4],
  },
});
