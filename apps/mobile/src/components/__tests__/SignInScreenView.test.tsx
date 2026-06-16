import { describe, expect, it, vi } from 'vitest';

import { SignInScreenView } from '@/components/SignInScreenView.js';
import {
  changeText,
  findAll,
  findByDisplayName,
  findByTestId,
  findByText,
  getDisplayName,
  press,
} from '@/testing/elementTree.js';
import type { ReactElement, ReactNode } from 'react';

interface ElementLike {
  type: { displayName?: string } | string;
  props: Record<string, unknown>;
}

function pressButton(node: ReactNode, testID: string): void {
  const matches = findAll(
    node,
    (el) => getDisplayName(el) === 'Pressable' && (el as ElementLike).props.testID === testID,
  );
  if (matches.length === 0) {
    throw new Error(`No Pressable button with testID ${testID}`);
  }
  press(matches[0] as ReactElement);
}

function renderView(overrides: Partial<Parameters<typeof SignInScreenView>[0]> = {}) {
  return SignInScreenView({
    phase: 'email',
    email: '',
    destinationEmail: 'barber@example.com',
    code: '',
    error: null,
    onEmailChange: vi.fn(),
    onCodeChange: vi.fn(),
    onSendCode: vi.fn(),
    onVerify: vi.fn(),
    onBackToEmail: vi.fn(),
    ...overrides,
  });
}

describe('SignInScreenView', () => {
  it('renders the loading state with the preserved loading testID', () => {
    const tree = renderView({ phase: 'loading' });

    expect(findByTestId(tree, 'sign-in-loading')).toBeDefined();
    expect(findByText(tree, 'Loading sign-in')).toBeDefined();
  });

  it('renders the email phase and preserves the email input testID', () => {
    const onEmailChange = vi.fn();
    const onSendCode = vi.fn();
    const tree = renderView({
      phase: 'email',
      email: 'barber@example.com',
      error: 'Please enter your email address.',
      onEmailChange,
      onSendCode,
    });

    const input = findByTestId(tree, 'email-input');
    expect(input).toBeDefined();
    expect(findByText(tree, 'Please enter your email address.')).toBeDefined();
    changeText(input, 'next@example.com');
    expect(onEmailChange).toHaveBeenCalledWith('next@example.com');

    press(findByTestId(tree, 'sign-in-send-code'));
    expect(onSendCode).toHaveBeenCalledTimes(1);
  });

  it('renders the code phase and preserves the code input testID', () => {
    const onCodeChange = vi.fn();
    const onVerify = vi.fn();
    const onBackToEmail = vi.fn();
    const tree = renderView({
      phase: 'code',
      code: '123456',
      onCodeChange,
      onVerify,
      onBackToEmail,
    });

    const input = findByTestId(tree, 'code-input');
    expect(input).toBeDefined();
    expect(findByText(tree, 'Check your email')).toBeDefined();
    changeText(input, '654321');
    expect(onCodeChange).toHaveBeenCalledWith('654321');

    press(findByTestId(tree, 'sign-in-verify'));
    expect(onVerify).toHaveBeenCalledTimes(1);

    press(findByTestId(tree, 'sign-in-back'));
    expect(onBackToEmail).toHaveBeenCalledTimes(1);
  });

  it('disables code-phase actions while verifying', () => {
    const onVerify = vi.fn();
    const onBackToEmail = vi.fn();
    const tree = renderView({
      phase: 'verifying',
      onVerify,
      onBackToEmail,
    });

    pressButton(tree, 'sign-in-verify');
    pressButton(tree, 'sign-in-back');
    expect(onVerify).not.toHaveBeenCalled();
    expect(onBackToEmail).not.toHaveBeenCalled();
  });

  it('renders the destination email in the code instructions', () => {
    const tree = renderView({
      phase: 'code',
      destinationEmail: 'owner@example.com',
    });

    expect(findByText(tree, 'Enter the 6-digit code sent to owner@example.com.')).toBeDefined();
  });

  it('keeps the same input display names for direct tree queries', () => {
    const emailTree = renderView({ phase: 'email' });
    expect(findByDisplayName(emailTree, 'TextInput')).toBeDefined();

    const codeTree = renderView({ phase: 'code' });
    expect(findByDisplayName(codeTree, 'TextInput')).toBeDefined();
  });
});
