// Test setup file for Mobile
// This runs before each test file

import { vi } from 'vitest';

// Mock environment variables
process.env.EXPO_PUBLIC_API_URL = 'http://localhost:3000/api/v1';
process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_mock';

// Global test timeout
vi.setConfig({
  testTimeout: 10000,
  hookTimeout: 10000
});

// React Native components cannot run in the Node test environment, so provide
// lightweight string-tag mocks. Tests invoke primitives as functions and inspect
// the returned React element tree, so only element creation is needed.
//
// IMPORTANT: mock factories are hoisted, so helper functions must be defined
// INSIDE the factory, not as top-level variables.
vi.mock('react-native', async () => {
  const React = await import('react');
  const createMockComponent = (name: string) => {
    const Component = React.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) => {
      const { children, ...rest } = props;
      return React.createElement(name, { ref, ...rest }, children as React.ReactNode);
    });
    Component.displayName = name;
    return Component;
  };

  const MockPressable = React.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) => {
    const { children, onPress, disabled, ...rest } = props;
    const handlePress = disabled ? undefined : onPress;
    return React.createElement('Pressable', { ref, onPress: handlePress, disabled, ...rest }, children as React.ReactNode);
  });
  MockPressable.displayName = 'Pressable';

  return {
    View: createMockComponent('View'),
    Text: createMockComponent('Text'),
    TextInput: createMockComponent('TextInput'),
    Pressable: MockPressable,
    ScrollView: createMockComponent('ScrollView'),
    SafeAreaView: createMockComponent('SafeAreaView'),
    ActivityIndicator: createMockComponent('ActivityIndicator'),
    RefreshControl: createMockComponent('RefreshControl'),
    StyleSheet: {
      create: (styles: Record<string, unknown>) => styles,
      hairlineWidth: 1,
    },
    Platform: {
      OS: 'ios',
      select: (obj: Record<string, unknown>) => obj.ios ?? obj.default,
    },
    StatusBar: createMockComponent('StatusBar'),
  };
});

vi.mock('react-native-safe-area-context', async () => {
  const React = await import('react');
  const createMockComponent = (name: string) => {
    const Component = React.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) => {
      const { children, ...rest } = props;
      return React.createElement(name, { ref, ...rest }, children as React.ReactNode);
    });
    Component.displayName = name;
    return Component;
  };

  return {
    SafeAreaView: createMockComponent('SafeAreaView'),
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});
