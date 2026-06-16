/**
 * Unit tests for the mobile UI primitives.
 *
 * Each primitive is invoked as a function and its returned React element tree
 * is inspected for forwarded testIDs and prop-driven visible content. This
 * avoids the need for a DOM/native renderer in the Node test environment.
 */
import { describe, it, expect, vi } from 'vitest';
import { Text, RefreshControl } from 'react-native';
import type { ReactElement, ReactNode } from 'react';

import {
  Screen,
  ScreenHeader,
  AppCard,
  AppButton,
  AppTextInput,
  StatusBadge,
  EmptyState,
  SectionHeader,
  MetricCard,
  ListItem,
  ActionRow,
  FormSection,
  RoleBadge,
  MoneyText,
  PriceText,
} from '@/components/ui/index.js';

interface ElementLike {
  type: { displayName?: string } | string;
  props: Record<string, unknown>;
}

function isReactElement(node: unknown): node is ReactElement {
  return (
    typeof node === 'object' &&
    node !== null &&
    'type' in node &&
    'props' in node &&
    typeof (node as ElementLike).props === 'object'
  );
}

function getDisplayName(node: ReactElement): string | undefined {
  const { type } = node as ElementLike;
  if (typeof type === 'string') return type;
  return type.displayName;
}

function findAll(
  node: ReactNode,
  predicate: (el: ReactElement) => boolean,
): ReactElement[] {
  const results: ReactElement[] = [];
  if (!isReactElement(node)) {
    if (Array.isArray(node)) {
      for (const child of node) results.push(...findAll(child, predicate));
    }
    return results;
  }
  if (predicate(node)) results.push(node);
  const children = (node as ElementLike).props.children as ReactNode;
  if (Array.isArray(children)) {
    for (const child of children) results.push(...findAll(child, predicate));
  } else {
    results.push(...findAll(children, predicate));
  }
  return results;
}

function findByTestId(node: ReactNode, testID: string): ReactElement {
  const results = findAll(node, (el) => (el as ElementLike).props.testID === testID);
  if (results.length === 0) {
    throw new Error(`No element with testID ${testID}`);
  }
  return results[0]!;
}

function findByDisplayName(node: ReactNode, displayName: string): ReactElement {
  const results = findAll(node, (el) => getDisplayName(el) === displayName);
  if (results.length === 0) {
    throw new Error(`No element with displayName ${displayName}`);
  }
  return results[0]!;
}

function textContent(el: ReactElement): string | null {
  const children = (el as ElementLike).props.children as ReactNode;
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) {
    return children
      .map((child) => {
        if (isReactElement(child)) return textContent(child);
        if (typeof child === 'string' || typeof child === 'number') return String(child);
        return null;
      })
      .filter((part): part is string => typeof part === 'string')
      .join('');
  }
  return null;
}

function findByText(node: ReactNode, text: string): ReactElement {
  const results = findAll(
    node,
    (el) => getDisplayName(el) === 'Text' && textContent(el) === text,
  );
  if (results.length === 0) {
    throw new Error(`No Text element with "${text}"`);
  }
  return results[0]!;
}

function queryByText(node: ReactNode, text: string): ReactElement | null {
  try {
    return findByText(node, text);
  } catch {
    return null;
  }
}

function press(element: ReactElement): void {
  const onPress = (element as ElementLike).props.onPress as (() => void) | undefined;
  onPress?.();
}

function changeText(element: ReactElement, value: string): void {
  const onChangeText = (element as ElementLike).props.onChangeText as
    | ((text: string) => void)
    | undefined;
  onChangeText?.(value);
}

describe('Screen', () => {
  it('renders children with a forwarded testID', () => {
    const tree = Screen({ testID: 'screen-root',       children: <Text>Screen child</Text> });
    expect(findByTestId(tree, 'screen-root')).toBeDefined();
    expect(findByText(tree, 'Screen child')).toBeDefined();
  });

  it('renders a scrollable variant', () => {
    const tree = Screen({
      testID: 'scrollable-screen',
      scrollable: true,
      children: <Text>Scrollable content</Text>,
    });
    expect(findByTestId(tree, 'scrollable-screen')).toBeDefined();
    expect(findByDisplayName(tree, 'ScrollView')).toBeDefined();
    expect(findByText(tree, 'Scrollable content')).toBeDefined();
  });

  it('forwards a refreshControl to the scrollable ScrollView', () => {
    const refreshControl = <RefreshControl testID='screen-refresh' refreshing={false} />;
    const tree = Screen({
      testID: 'scrollable-screen-rc',
      scrollable: true,
      refreshControl,
      children: <Text>Pullable content</Text>,
    });
    const scrollView = findByDisplayName(tree, 'ScrollView');
    expect(scrollView).toBeDefined();
    expect((scrollView as ElementLike).props.refreshControl).toBe(refreshControl);
    expect(findByText(tree, 'Pullable content')).toBeDefined();
  });
});

describe('ScreenHeader', () => {
  it('renders the title and optional subtitle', () => {
    const tree = ScreenHeader({ testID: 'header-root', title: 'Dashboard', subtitle: 'Owner view' });
    expect(findByTestId(tree, 'header-root')).toBeDefined();
    expect(findByText(tree, 'Dashboard')).toBeDefined();
    expect(findByText(tree, 'Owner view')).toBeDefined();
  });

  it('renders a right action element', () => {
    const tree = ScreenHeader({
      testID: 'header-action',
      title: 'Settings',
      rightAction: <Text>Save</Text>,
    });
    expect(findByText(tree, 'Save')).toBeDefined();
  });
});

describe('AppCard', () => {
  it('renders children and forwards testID', () => {
    const tree = AppCard({ testID: 'card-root', children: <Text>Card content</Text> });
    expect(findByTestId(tree, 'card-root')).toBeDefined();
    expect(findByText(tree, 'Card content')).toBeDefined();
  });

  it('renders a title when provided', () => {
    const tree = AppCard({
      testID: 'card-title',
      title: 'Revenue',
      children: <Text>Body</Text>,
    });
    expect(findByText(tree, 'Revenue')).toBeDefined();
    expect(findByText(tree, 'Body')).toBeDefined();
  });

  it('renders a footer element', () => {
    const tree = AppCard({
      testID: 'card-footer',
      footer: <Text>Footer link</Text>,
      children: <Text>Body</Text>,
    });
    expect(findByText(tree, 'Footer link')).toBeDefined();
  });
});

describe('AppButton', () => {
  it('renders the title and forwards testID', () => {
    const tree = AppButton({ testID: 'btn-root', title: 'Submit' });
    expect(findByTestId(tree, 'btn-root')).toBeDefined();
    expect(findByText(tree, 'Submit')).toBeDefined();
  });

  it('calls onPress when pressed', () => {
    const handlePress = vi.fn();
    const tree = AppButton({ testID: 'btn-press', title: 'Press me', onPress: handlePress });
    press(findByTestId(tree, 'btn-press'));
    expect(handlePress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', () => {
    const handlePress = vi.fn();
    const tree = AppButton({
      testID: 'btn-disabled',
      title: 'Disabled',
      onPress: handlePress,
      disabled: true,
    });
    press(findByTestId(tree, 'btn-disabled'));
    expect(handlePress).not.toHaveBeenCalled();
  });

  it('shows loading text when loading', () => {
    const tree = AppButton({
      testID: 'btn-loading',
      title: 'Save',
      loading: true,
      loadingText: 'Saving…',
    });
    expect(queryByText(tree, 'Save')).toBeNull();
    expect(findByText(tree, 'Saving…')).toBeDefined();
  });
});

describe('AppTextInput', () => {
  it('renders with testID and placeholder', () => {
    const tree = AppTextInput({ testID: 'input-root', placeholder: 'Enter name' });
    expect(findByTestId(tree, 'input-root')).toBeDefined();
    const input = findByDisplayName(tree, 'TextInput');
    expect(input).toBeDefined();
    expect((input as ElementLike).props.placeholder).toBe('Enter name');
  });

  it('renders a label and error message', () => {
    const tree = AppTextInput({ testID: 'input-error', label: 'Email', error: 'Invalid email' });
    expect(findByText(tree, 'Email')).toBeDefined();
    expect(findByText(tree, 'Invalid email')).toBeDefined();
  });

  it('calls onChangeText when text changes', () => {
    const handleChange = vi.fn();
    const tree = AppTextInput({ testID: 'input-change', onChangeText: handleChange });
    changeText(findByDisplayName(tree, 'TextInput'), 'hello');
    expect(handleChange).toHaveBeenCalledWith('hello');
  });
});

describe('StatusBadge', () => {
  it.each([
    ['PENDING', 'Pending'],
    ['CONFIRMED', 'Confirmed'],
    ['IN_PROGRESS', 'In Progress'],
    ['COMPLETED', 'Completed'],
    ['CANCELLED', 'Cancelled'],
    ['NO_SHOW', 'No Show'],
  ])('renders readable label for %s', (status, expectedLabel) => {
    const tree = StatusBadge({ testID: `badge-${status}`, status });
    expect(findByTestId(tree, `badge-${status}`)).toBeDefined();
    expect(findByText(tree, expectedLabel)).toBeDefined();
  });

  it('falls back to the raw status for unknown values', () => {
    const tree = StatusBadge({ testID: 'badge-unknown', status: 'UNKNOWN' });
    expect(findByText(tree, 'Unknown')).toBeDefined();
  });
});

describe('EmptyState', () => {
  it('renders title, message, and optional action', () => {
    const tree = EmptyState({
      testID: 'empty-root',
      title: 'No records',
      message: 'Records you create will appear here.',
      action: <Text>Create one</Text>,
    });
    expect(findByTestId(tree, 'empty-root')).toBeDefined();
    expect(findByText(tree, 'No records')).toBeDefined();
    expect(findByText(tree, 'Records you create will appear here.')).toBeDefined();
    expect(findByText(tree, 'Create one')).toBeDefined();
  });
});

describe('SectionHeader', () => {
  it('renders title and optional action', () => {
    const tree = SectionHeader({
      testID: 'section-root',
      title: 'Employees',
      action: <Text>See all</Text>,
    });
    expect(findByTestId(tree, 'section-root')).toBeDefined();
    expect(findByText(tree, 'Employees')).toBeDefined();
    expect(findByText(tree, 'See all')).toBeDefined();
  });
});

describe('MetricCard', () => {
  it('renders value and label', () => {
    const tree = MetricCard({ testID: 'metric-root', value: '$12.500', label: 'Revenue' });
    expect(findByTestId(tree, 'metric-root')).toBeDefined();
    expect(findByText(tree, '$12.500')).toBeDefined();
    expect(findByText(tree, 'Revenue')).toBeDefined();
  });

  it('renders a positive trend', () => {
    const tree = MetricCard({
      testID: 'metric-trend',
      value: '42',
      label: 'Records',
      trend: { value: 12, isPositive: true },
    });
    expect(findByText(tree, '+12%')).toBeDefined();
  });

  it('renders a negative trend', () => {
    const tree = MetricCard({
      testID: 'metric-negative',
      value: '8',
      label: 'No-shows',
      trend: { value: 3, isPositive: false },
    });
    expect(findByText(tree, '-3%')).toBeDefined();
  });
});

describe('ListItem', () => {
  it('renders title, subtitle, and leading/trailing elements', () => {
    const tree = ListItem({
      testID: 'list-item-root',
      title: 'Haircut',
      subtitle: '30 min',
      leading: <Text>Icon</Text>,
      trailing: <Text>›</Text>,
    });
    expect(findByTestId(tree, 'list-item-root')).toBeDefined();
    expect(findByText(tree, 'Haircut')).toBeDefined();
    expect(findByText(tree, '30 min')).toBeDefined();
    expect(findByText(tree, 'Icon')).toBeDefined();
    expect(findByText(tree, '›')).toBeDefined();
  });

  it('calls onPress when pressed', () => {
    const handlePress = vi.fn();
    const tree = ListItem({ testID: 'list-item-press', title: 'Press me', onPress: handlePress });
    const pressable = findByDisplayName(tree, 'Pressable');
    press(pressable);
    expect(handlePress).toHaveBeenCalledTimes(1);
  });
});

describe('ActionRow', () => {
  it('renders label and action children', () => {
    const tree = ActionRow({
      testID: 'action-row-root',
      label: 'Enable notifications',
      children: <Text>Toggle</Text>,
    });
    expect(findByTestId(tree, 'action-row-root')).toBeDefined();
    expect(findByText(tree, 'Enable notifications')).toBeDefined();
    expect(findByText(tree, 'Toggle')).toBeDefined();
  });
});

describe('FormSection', () => {
  it('renders title, helper text, and children', () => {
    const tree = FormSection({
      testID: 'form-section-root',
      title: 'Service details',
      helper: 'All fields are required.',
      children: <Text>Fields</Text>,
    });
    expect(findByTestId(tree, 'form-section-root')).toBeDefined();
    expect(findByText(tree, 'Service details')).toBeDefined();
    expect(findByText(tree, 'All fields are required.')).toBeDefined();
    expect(findByText(tree, 'Fields')).toBeDefined();
  });
});

describe('RoleBadge', () => {
  it.each([
    ['OWNER', 'Owner'],
    ['BARBER', 'Barber'],
    ['CLIENT', 'Client'],
  ])('renders readable label for %s', (role, expectedLabel) => {
    const tree = RoleBadge({ testID: `role-${role}`, role });
    expect(findByTestId(tree, `role-${role}`)).toBeDefined();
    expect(findByText(tree, expectedLabel)).toBeDefined();
  });

  it('falls back for unknown roles', () => {
    const tree = RoleBadge({ testID: 'role-unknown', role: 'ADMIN' });
    expect(findByText(tree, 'Unknown')).toBeDefined();
  });
});

describe('MoneyText', () => {
  it('formats cents as currency', () => {
    const tree = MoneyText({ testID: 'money-root', priceCents: 5000 });
    expect(findByTestId(tree, 'money-root')).toBeDefined();
    expect(findByText(tree, '$50.00')).toBeDefined();
  });

  it('renders a placeholder for null/undefined price', () => {
    let tree = MoneyText({ testID: 'money-empty', priceCents: null });
    expect(findByText(tree, '—')).toBeDefined();
    tree = MoneyText({ testID: 'money-empty', priceCents: undefined });
    expect(findByText(tree, '—')).toBeDefined();
  });
});

describe('PriceText', () => {
  it('is an alias that formats cents as currency', () => {
    const tree = PriceText({ testID: 'price-root', priceCents: 250000 });
    expect(findByTestId(tree, 'price-root')).toBeDefined();
    expect(findByText(tree, '$2500.00')).toBeDefined();
  });
});
