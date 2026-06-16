/**
 * Test helpers for inspecting React element trees without a native renderer.
 *
 * Mobile tests run in a Node environment where react-native is mocked, so
 * components are invoked as functions and their returned element trees are
 * walked with the helpers below.
 */
import type { ReactElement, ReactNode } from 'react';

interface ElementLike {
  type: { displayName?: string } | string;
  props: Record<string, unknown>;
}

export function isReactElement(node: unknown): node is ReactElement {
  return (
    typeof node === 'object' &&
    node !== null &&
    'type' in node &&
    'props' in node &&
    typeof (node as ElementLike).props === 'object'
  );
}

export function getDisplayName(node: ReactElement): string | undefined {
  const { type } = node as ElementLike;
  if (typeof type === 'string') return type;
  return type.displayName;
}

export function findAll(
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

  const el = node as ElementLike;
  let resolvedNode: ReactNode = node;
  // Resolve function components so tests can see the rendered children of
  // composed components (the test environment mocks RN primitives as
  // functions, but they return string-typed elements and terminate here).
  if (typeof el.type === 'function') {
    try {
      resolvedNode = (el.type as (props: Record<string, unknown>) => ReactNode)(el.props);
    } catch {
      resolvedNode = null;
    }
  }

  if (resolvedNode !== node) {
    results.push(...findAll(resolvedNode, predicate));
    return results;
  }

  const children = el.props.children as ReactNode;
  if (Array.isArray(children)) {
    for (const child of children) results.push(...findAll(child, predicate));
  } else {
    results.push(...findAll(children, predicate));
  }
  return results;
}

export function findByTestId(node: ReactNode, testID: string): ReactElement {
  const results = findAll(node, (el) => (el as ElementLike).props.testID === testID);
  if (results.length === 0) {
    throw new Error(`No element with testID ${testID}`);
  }
  return results[0]!;
}

export function queryByTestId(node: ReactNode, testID: string): ReactElement | null {
  try {
    return findByTestId(node, testID);
  } catch {
    return null;
  }
}

export function findByDisplayName(node: ReactNode, displayName: string): ReactElement {
  const results = findAll(node, (el) => getDisplayName(el) === displayName);
  if (results.length === 0) {
    throw new Error(`No element with displayName ${displayName}`);
  }
  return results[0]!;
}

export function textContent(el: ReactElement): string | null {
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

export function findByText(node: ReactNode, text: string): ReactElement {
  const results = findAll(
    node,
    (el) => getDisplayName(el) === 'Text' && textContent(el) === text,
  );
  if (results.length === 0) {
    throw new Error(`No Text element with "${text}"`);
  }
  return results[0]!;
}

export function queryByText(node: ReactNode, text: string): ReactElement | null {
  try {
    return findByText(node, text);
  } catch {
    return null;
  }
}

export function press(element: ReactElement): void {
  const onPress = (element as ElementLike).props.onPress as (() => void) | undefined;
  onPress?.();
}

export function changeText(element: ReactElement, value: string): void {
  const onChangeText = (element as ElementLike).props.onChangeText as
    | ((text: string) => void)
    | undefined;
  onChangeText?.(value);
}
