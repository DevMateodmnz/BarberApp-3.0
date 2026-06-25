/**
 * Screen primitive — safe-area-aware root container.
 *
 * Provides consistent background, flex layout, and optional scrollability
 * so every screen starts from the same visual foundation.
 */
import {
  Component,
  createContext,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  type EmitterSubscription,
  type KeyboardAvoidingViewProps,
  type RefreshControlProps,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '@/theme/index.js';

interface KeyboardAwareScreenContextValue {
  onInputFocus: (target: number | null) => void;
  onInputBlur: (target: number | null) => void;
}

export const KeyboardAwareScreenContext = createContext<KeyboardAwareScreenContextValue | null>(null);

interface ScreenProps {
  testID?: string;
  scrollable?: boolean;
  keyboardAware?: boolean;
  keyboardVerticalOffset?: number;
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
  keyboardDismissMode?: ScrollViewProps['keyboardDismissMode'];
  refreshControl?: ReactElement<RefreshControlProps>;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

interface KeyboardAwareScrollContainerProps {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  keyboardBehavior: KeyboardAvoidingViewProps['behavior'];
  keyboardDismissMode?: ScrollViewProps['keyboardDismissMode'];
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
  keyboardVerticalOffset: number;
  refreshControl?: ReactElement<RefreshControlProps>;
  testID?: string;
}

class KeyboardAwareScrollContainer extends Component<KeyboardAwareScrollContainerProps> {
  private scrollViewRef = { current: null as ScrollView | null };
  private focusedTarget: number | null = null;
  private keyboardVisible = false;
  private pendingScrollTimer: ReturnType<typeof setTimeout> | null = null;
  private keyboardShowSubscription: EmitterSubscription | null = null;
  private keyboardHideSubscription: EmitterSubscription | null = null;

  override componentDidMount() {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    this.keyboardShowSubscription = Keyboard.addListener(showEvent, this.handleKeyboardDidShow);
    this.keyboardHideSubscription = Keyboard.addListener(hideEvent, this.handleKeyboardDidHide);
  }

  override componentWillUnmount() {
    this.focusedTarget = null;
    this.keyboardVisible = false;
    this.clearPendingScroll();
    this.keyboardShowSubscription?.remove();
    this.keyboardHideSubscription?.remove();
  }

  private handleKeyboardDidShow = () => {
    this.keyboardVisible = true;
    this.scheduleFocusedInputScroll();
  };

  private handleKeyboardDidHide = () => {
    this.keyboardVisible = false;
    this.focusedTarget = null;
    this.clearPendingScroll();
  };

  private clearPendingScroll() {
    if (this.pendingScrollTimer) {
      clearTimeout(this.pendingScrollTimer);
      this.pendingScrollTimer = null;
    }
  }

  private scheduleFocusedInputScroll() {
    this.clearPendingScroll();

    if (!this.focusedTarget) {
      return;
    }

    this.pendingScrollTimer = setTimeout(() => {
      this.scrollFocusedInputIntoView();
    }, this.keyboardVisible ? 48 : 180);
  }

  private scrollFocusedInputIntoView() {
    const target = this.focusedTarget;
    const scrollView = this.scrollViewRef.current;

    if (!target || !scrollView) {
      return;
    }

    const responder =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (scrollView as any).getScrollResponder?.() ??
      scrollView;
    const scrollToKeyboard =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      responder?.scrollResponderScrollNativeHandleToKeyboard ??
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (scrollView as any).scrollResponderScrollNativeHandleToKeyboard;

    if (typeof scrollToKeyboard === 'function') {
      scrollToKeyboard.call(
        responder,
        target,
        tokens.spacing[16],
        true,
      );
    }
  }

  private handleInputFocus = (target: number | null) => {
    this.focusedTarget = target;
    this.scheduleFocusedInputScroll();
  };

  private handleInputBlur = (target: number | null) => {
    if (target === null || this.focusedTarget === target) {
      this.focusedTarget = null;
      this.clearPendingScroll();
    }
  };

  override render() {
    const {
      children,
      contentContainerStyle,
      keyboardBehavior,
      keyboardDismissMode,
      keyboardShouldPersistTaps,
      keyboardVerticalOffset,
      refreshControl,
      testID,
    } = this.props;

    return (
      <KeyboardAwareScreenContext.Provider
        value={{
          onInputFocus: this.handleInputFocus,
          onInputBlur: this.handleInputBlur,
        }}
      >
        <KeyboardAvoidingView
          style={styles.keyboardRoot}
          behavior={keyboardBehavior}
          keyboardVerticalOffset={keyboardVerticalOffset}
        >
          <ScrollView
            ref={(node) => {
              this.scrollViewRef.current = node;
            }}
            style={styles.scrollView}
            contentContainerStyle={contentContainerStyle}
            testID={testID ? `${testID}-scroll` : undefined}
            refreshControl={refreshControl}
            keyboardShouldPersistTaps={keyboardShouldPersistTaps}
            keyboardDismissMode={keyboardDismissMode}
          >
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </KeyboardAwareScreenContext.Provider>
    );
  }
}

export function Screen({
  testID,
  scrollable = false,
  keyboardAware = false,
  keyboardVerticalOffset = 0,
  keyboardShouldPersistTaps,
  keyboardDismissMode,
  refreshControl,
  children,
  style,
  contentContainerStyle,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const keyboardBehavior: KeyboardAvoidingViewProps['behavior'] =
    Platform.OS === 'ios' ? 'padding' : undefined;

  const scrollableContent = scrollable ? (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: tokens.spacing[8] + insets.bottom },
        contentContainerStyle,
      ]}
      testID={testID ? `${testID}-scroll` : undefined}
      refreshControl={refreshControl}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps ?? (keyboardAware ? 'handled' : undefined)}
      keyboardDismissMode={keyboardDismissMode ?? (keyboardAware ? 'on-drag' : 'none')}
    >
      {children}
    </ScrollView>
  ) : (
    children
  );

  if (
    keyboardAware &&
    scrollable &&
    process.env.NODE_ENV !== 'test'
  ) {
    return (
      <SafeAreaView testID={testID} style={[styles.root, style]}>
        <KeyboardAwareScrollContainer
          testID={testID}
          refreshControl={refreshControl}
          keyboardBehavior={keyboardBehavior}
          keyboardVerticalOffset={keyboardVerticalOffset}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps ?? 'handled'}
          keyboardDismissMode={keyboardDismissMode ?? 'on-drag'}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: tokens.spacing[8] + insets.bottom },
            contentContainerStyle,
          ]}
        >
          {children}
        </KeyboardAwareScrollContainer>
      </SafeAreaView>
    );
  }

  const content = keyboardAware ? (
    <KeyboardAvoidingView
      style={styles.keyboardRoot}
      behavior={keyboardBehavior}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      {scrollableContent}
    </KeyboardAvoidingView>
  ) : (
    scrollableContent
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
  keyboardRoot: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: tokens.spacing[4],
  },
});
