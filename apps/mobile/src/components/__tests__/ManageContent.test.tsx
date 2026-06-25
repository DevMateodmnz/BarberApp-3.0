import { describe, expect, it, vi } from 'vitest';

import { ManageContent } from '@/components/ManageContent.js';
import { findByTestId, findByText, press, queryByTestId } from '@/testing/elementTree.js';

function renderManageContent(overrides: Partial<Parameters<typeof ManageContent>[0]> = {}) {
  return ManageContent({
    isOwner: true,
    onServices: vi.fn(),
    onEmployees: vi.fn(),
    onWorkingHours: vi.fn(),
    onOpenLanguageSettings: vi.fn(),
    ...overrides,
  });
}

describe('ManageContent', () => {
  it('renders the owner management destinations and opens each action', () => {
    const onServices = vi.fn();
    const onEmployees = vi.fn();
    const onWorkingHours = vi.fn();
    const onOpenLanguageSettings = vi.fn();

    const tree = renderManageContent({
      onServices,
      onEmployees,
      onWorkingHours,
      onOpenLanguageSettings,
    });

    expect(findByText(tree, 'Manage')).toBeDefined();
    expect(findByTestId(tree, 'manage-services')).toBeDefined();
    expect(findByTestId(tree, 'manage-employees')).toBeDefined();
    expect(findByTestId(tree, 'manage-working-hours')).toBeDefined();
    expect(findByTestId(tree, 'manage-language')).toBeDefined();

    press(findByTestId(tree, 'manage-services'));
    press(findByTestId(tree, 'manage-employees'));
    press(findByTestId(tree, 'manage-working-hours'));
    press(findByTestId(tree, 'manage-language'));

    expect(onServices).toHaveBeenCalledTimes(1);
    expect(onEmployees).toHaveBeenCalledTimes(1);
    expect(onWorkingHours).toHaveBeenCalledTimes(1);
    expect(onOpenLanguageSettings).toHaveBeenCalledTimes(1);
  });

  it('renders a blocked owner-only state for non-owner roles', () => {
    const tree = renderManageContent({ isOwner: false });

    expect(findByTestId(tree, 'manage-blocked')).toBeDefined();
    expect(findByText(tree, 'Owner access only')).toBeDefined();
    expect(queryByTestId(tree, 'manage-services')).toBeNull();
    expect(queryByTestId(tree, 'manage-language')).toBeNull();
  });
});
