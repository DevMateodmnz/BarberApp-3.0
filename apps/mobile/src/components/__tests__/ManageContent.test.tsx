import { describe, expect, it, vi } from 'vitest';

import { ManageContent } from '@/components/ManageContent.js';
import { findByTestId, findByText, press, queryByTestId } from '@/testing/elementTree.js';

function renderManageContent(overrides: Partial<Parameters<typeof ManageContent>[0]> = {}) {
  return ManageContent({
    role: 'OWNER',
    onPayments: vi.fn(),
    onNotifications: vi.fn(),
    onServices: vi.fn(),
    onEmployees: vi.fn(),
    onWorkingHours: vi.fn(),
    onOwnSchedule: vi.fn(),
    onOpenLanguageSettings: vi.fn(),
    ...overrides,
  });
}

describe('ManageContent', () => {
  it('renders the owner management destinations and opens each action', () => {
    const onNotifications = vi.fn();
    const onPayments = vi.fn();
    const onServices = vi.fn();
    const onEmployees = vi.fn();
    const onWorkingHours = vi.fn();
    const onOpenLanguageSettings = vi.fn();

    const tree = renderManageContent({
      onNotifications,
      onPayments,
      onServices,
      onEmployees,
      onWorkingHours,
      onOpenLanguageSettings,
    });

    expect(findByText(tree, 'Manage')).toBeDefined();
    expect(findByTestId(tree, 'manage-payments')).toBeDefined();
    expect(findByTestId(tree, 'manage-notifications')).toBeDefined();
    expect(findByTestId(tree, 'manage-services')).toBeDefined();
    expect(findByTestId(tree, 'manage-employees')).toBeDefined();
    expect(findByTestId(tree, 'manage-working-hours')).toBeDefined();
    expect(findByTestId(tree, 'manage-language')).toBeDefined();
    expect(queryByTestId(tree, 'manage-own-schedule')).toBeNull();

    press(findByTestId(tree, 'manage-payments'));
    press(findByTestId(tree, 'manage-notifications'));
    press(findByTestId(tree, 'manage-services'));
    press(findByTestId(tree, 'manage-employees'));
    press(findByTestId(tree, 'manage-working-hours'));
    press(findByTestId(tree, 'manage-language'));

    expect(onPayments).toHaveBeenCalledTimes(1);
    expect(onNotifications).toHaveBeenCalledTimes(1);
    expect(onServices).toHaveBeenCalledTimes(1);
    expect(onEmployees).toHaveBeenCalledTimes(1);
    expect(onWorkingHours).toHaveBeenCalledTimes(1);
    expect(onOpenLanguageSettings).toHaveBeenCalledTimes(1);
  });

  it('renders the barber own-schedule tile and hides owner-only destinations', () => {
    const onOwnSchedule = vi.fn();
    const tree = renderManageContent({ role: 'BARBER', onOwnSchedule });

    expect(findByTestId(tree, 'manage-own-schedule')).toBeDefined();
    expect(queryByTestId(tree, 'manage-notifications')).toBeNull();
    expect(queryByTestId(tree, 'manage-payments')).toBeNull();
    expect(queryByTestId(tree, 'manage-services')).toBeNull();
    expect(queryByTestId(tree, 'manage-employees')).toBeNull();
    expect(queryByTestId(tree, 'manage-working-hours')).toBeNull();
    expect(findByTestId(tree, 'manage-language')).toBeDefined();

    press(findByTestId(tree, 'manage-own-schedule'));
    expect(onOwnSchedule).toHaveBeenCalledTimes(1);
  });

  it('renders a blocked state for client users', () => {
    const tree = renderManageContent({ role: 'CLIENT' });

    expect(findByTestId(tree, 'manage-blocked')).toBeDefined();
    expect(findByText(tree, 'Owner and barber access only')).toBeDefined();
    expect(queryByTestId(tree, 'manage-notifications')).toBeNull();
    expect(queryByTestId(tree, 'manage-services')).toBeNull();
    expect(queryByTestId(tree, 'manage-language')).toBeNull();
  });
});
