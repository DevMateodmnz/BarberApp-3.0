// Test setup file for Mobile
// This runs before each test file

import { beforeEach, vi } from 'vitest';
import { mobileLocalizationRuntime } from '../src/i18n/runtime.js';

Object.defineProperty(globalThis, '__DEV__', {
  configurable: true,
  value: false,
  writable: true,
});

// Mock environment variables
process.env.EXPO_PUBLIC_APP_ENV = 'development';
process.env.EXPO_PUBLIC_API_URL = 'http://localhost:3000/api/v1';
process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_mock';
delete process.env.EXPO_PUBLIC_CLERK_SECRET_KEY;
delete process.env.EXPO_PUBLIC_CLERK_WEBHOOK_SECRET;

// Global test timeout
vi.setConfig({
  testTimeout: 10000,
  hookTimeout: 10000
});

vi.mock('expo-localization', () => ({
  getLocales: () => [
    {
      languageTag: 'es-AR',
      languageCode: 'es',
      languageScriptCode: null,
      regionCode: 'AR',
    },
  ],
}));

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
  deleteItemAsync: vi.fn(async () => undefined),
}));

vi.mock('react-i18next', () => ({
  I18nextProvider: ({ children }: { children: unknown }) => children,
  useTranslation: () => ({
    i18n: mobileLocalizationRuntime.i18n,
    t: (key: string, options?: Record<string, unknown>) =>
      mobileLocalizationRuntime.i18n.t(key, options),
  }),
}));

beforeEach(async () => {
  await mobileLocalizationRuntime.bootstrap();
  await mobileLocalizationRuntime.setPreference('en');
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

  const MockFlatList = React.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) => {
    const {
      data = [],
      renderItem,
      ListHeaderComponent,
      ListEmptyComponent,
      keyExtractor,
      ...rest
    } = props as {
      data?: unknown[];
      renderItem?: (info: { item: unknown; index: number }) => React.ReactNode;
      ListHeaderComponent?: React.ReactNode;
      ListEmptyComponent?: React.ReactNode;
      keyExtractor?: (item: unknown, index: number) => string;
    };

    const children: React.ReactNode[] = [];
    if (ListHeaderComponent) {
      children.push(ListHeaderComponent);
    }

    if (data.length === 0) {
      if (ListEmptyComponent) {
        children.push(ListEmptyComponent);
      }
    } else if (renderItem) {
      data.forEach((item, index) => {
        children.push(
          React.createElement(
            React.Fragment,
            { key: keyExtractor?.(item, index) ?? String(index) },
            renderItem({ item, index }),
          ),
        );
      });
    }

    return React.createElement('FlatList', { ref, ...rest }, children);
  });
  MockFlatList.displayName = 'FlatList';

  return {
    View: createMockComponent('View'),
    Text: createMockComponent('Text'),
    TextInput: createMockComponent('TextInput'),
    Pressable: MockPressable,
    FlatList: MockFlatList,
    ScrollView: createMockComponent('ScrollView'),
    KeyboardAvoidingView: createMockComponent('KeyboardAvoidingView'),
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
    AppState: {
      addEventListener: () => ({
        remove: () => undefined,
      }),
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

vi.mock('@expo/vector-icons', async () => {
  const React = await import('react');
  const Ionicons = React.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) =>
    React.createElement('Ionicons', { ref, ...props }),
  );
  Ionicons.displayName = 'Ionicons';

  return { Ionicons };
});
