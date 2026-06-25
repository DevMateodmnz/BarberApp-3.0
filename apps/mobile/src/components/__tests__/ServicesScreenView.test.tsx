import { describe, it, expect, vi } from 'vitest';

import { ServicesScreenView } from '@/components/ServicesScreenView.js';
import { formatCentsForDisplay } from '@/lib/format.js';
import {
  changeText,
  findAll,
  findByDisplayName,
  findByTestId,
  findByText,
  getDisplayName,
  press,
  queryByTestId,
} from '@/testing/elementTree.js';
import type { ReactElement, ReactNode } from 'react';
import type { Service } from '@/lib/types.js';
import type { ServiceStatusFilter } from '@/lib/serviceFilters.js';

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

const OWNER_CONTEXT = {
  userId: 'u-owner',
  role: 'OWNER' as const,
  barbershopId: 'shop-1',
  barbershopName: 'Main St Barber',
  employeeId: null,
  employeeName: null,
};

const BARBER_CONTEXT = {
  userId: 'u-barber',
  role: 'BARBER' as const,
  barbershopId: 'shop-1',
  barbershopName: 'Main St Barber',
  employeeId: 'emp-1',
  employeeName: 'Carlos',
};

const SERVICES: Service[] = [
  {
    id: 'svc-1',
    name: 'Classic Cut',
    description: 'Scissors and clippers',
    durationMinutes: 30,
    priceCents: 500000,
    currency: 'ARS',
    isActive: true,
  },
  {
    id: 'svc-2',
    name: 'Beard Trim',
    description: null,
    durationMinutes: 15,
    priceCents: 250000,
    currency: 'ARS',
    isActive: false,
  },
];

function renderView(overrides: Partial<Parameters<typeof ServicesScreenView>[0]> = {}) {
  return ServicesScreenView({
    isContextLoading: false,
    contextError: null,
    context: OWNER_CONTEXT,
    isOwner: true,
    showCreateForm: false,
    createForm: {
      name: '',
      priceInput: '',
      durationInput: '',
      description: '',
      error: null,
      isCreating: false,
    },
    editForm: {
      serviceId: null,
      name: '',
      priceInput: '',
      durationInput: '',
      description: '',
      error: null,
      isUpdating: false,
    },
    searchQuery: '',
    statusFilter: 'ACTIVE' as ServiceStatusFilter,
    statusCounts: { ACTIVE: 1, INACTIVE: 1, ALL: 2 },
    isServicesLoading: false,
    servicesError: null,
    visibleServices: SERVICES,
    onRefresh: vi.fn(),
    onBack: vi.fn(),
    onShowCreateForm: vi.fn(),
    onCancelCreate: vi.fn(),
    onCreate: vi.fn(),
    onCreateNameChange: vi.fn(),
    onCreatePriceChange: vi.fn(),
    onCreateDurationChange: vi.fn(),
    onCreateDescriptionChange: vi.fn(),
    onSearchChange: vi.fn(),
    onClearSearch: vi.fn(),
    onFilterChange: vi.fn(),
    onStartEditing: vi.fn(),
    onCancelEditing: vi.fn(),
    onUpdate: vi.fn(),
    onEditNameChange: vi.fn(),
    onEditPriceChange: vi.fn(),
    onEditDurationChange: vi.fn(),
    onEditDescriptionChange: vi.fn(),
    onToggleActive: vi.fn(),
    ...overrides,
  });
}

function textInInput(wrapper: unknown): string {
  const input = findByDisplayName(wrapper as Parameters<typeof findByDisplayName>[0], 'TextInput');
  return (input as ElementLike).props.value as string;
}

describe('ServicesScreenView', () => {
  it('renders a context loading state', () => {
    const tree = renderView({ context: null, isContextLoading: true });
    expect(findByTestId(tree, 'services-loading')).toBeDefined();
    expect(findByText(tree, 'Loading your context…')).toBeDefined();
  });

  it('renders a context error state', () => {
    const tree = renderView({ context: null, contextError: 'Context failed' });
    expect(findByTestId(tree, 'services-error')).toBeDefined();
    expect(findByText(tree, 'Context failed')).toBeDefined();
  });

  it('renders a no-context hint', () => {
    const tree = renderView({ context: null });
    expect(findByTestId(tree, 'services-no-context')).toBeDefined();
    expect(findByText(tree, 'No context available yet.')).toBeDefined();
  });

  it('renders a non-owner blocked message', () => {
    const tree = renderView({ context: BARBER_CONTEXT, isOwner: false });
    expect(findByTestId(tree, 'services-blocked')).toBeDefined();
    expect(findByText(tree, 'Only owners can manage the service catalog.')).toBeDefined();
  });

  it('renders the screen header and add button for owners', () => {
    const onShowCreateForm = vi.fn();
    const tree = renderView({ onShowCreateForm });
    expect(findByText(tree, 'Services')).toBeDefined();
    expect(findByText(tree, 'Your barbershop service catalog.')).toBeDefined();
    const addButton = findByTestId(tree, 'services-add-button');
    expect(addButton).toBeDefined();
    press(addButton);
    expect(onShowCreateForm).toHaveBeenCalledTimes(1);
  });

  it('renders the create form with fields and error', () => {
    const tree = renderView({
      showCreateForm: true,
      createForm: {
        name: 'New Cut',
        priceInput: '5000',
        durationInput: '30',
        description: 'Scissors and clippers',
        error: 'Name is required.',
        isCreating: false,
      },
    });

    expect(findByTestId(tree, 'services-create-form')).toBeDefined();
    expect(textInInput(findByTestId(tree, 'services-create-name'))).toBe('New Cut');
    expect(textInInput(findByTestId(tree, 'services-create-price'))).toBe('5000');
    expect(textInInput(findByTestId(tree, 'services-create-duration'))).toBe('30');
    expect(textInInput(findByTestId(tree, 'services-create-description'))).toBe('Scissors and clippers');
    expect(findByTestId(tree, 'services-create-error')).toBeDefined();
    expect(findByText(tree, 'Name is required.')).toBeDefined();
    expect(findByTestId(tree, 'services-create-submit')).toBeDefined();
    expect(findByTestId(tree, 'services-create-cancel')).toBeDefined();
  });

  it('calls create form change handlers', () => {
    const onCreateNameChange = vi.fn();
    const onCreatePriceChange = vi.fn();
    const onCreateDurationChange = vi.fn();
    const onCreateDescriptionChange = vi.fn();

    const tree = renderView({
      showCreateForm: true,
      onCreateNameChange,
      onCreatePriceChange,
      onCreateDurationChange,
      onCreateDescriptionChange,
    });

    changeText(findByDisplayName(findByTestId(tree, 'services-create-name'), 'TextInput'), 'Fade');
    expect(onCreateNameChange).toHaveBeenCalledWith('Fade');

    changeText(findByDisplayName(findByTestId(tree, 'services-create-price'), 'TextInput'), '4500');
    expect(onCreatePriceChange).toHaveBeenCalledWith('4500');

    changeText(findByDisplayName(findByTestId(tree, 'services-create-duration'), 'TextInput'), '45');
    expect(onCreateDurationChange).toHaveBeenCalledWith('45');

    changeText(
      findByDisplayName(findByTestId(tree, 'services-create-description'), 'TextInput'),
      'Premium service',
    );
    expect(onCreateDescriptionChange).toHaveBeenCalledWith('Premium service');
  });

  it('calls onCreate and onCancelCreate from the create form', () => {
    const onCreate = vi.fn();
    const onCancelCreate = vi.fn();
    const tree = renderView({ showCreateForm: true, onCreate, onCancelCreate });

    press(findByTestId(tree, 'services-create-submit'));
    expect(onCreate).toHaveBeenCalledTimes(1);

    press(findByTestId(tree, 'services-create-cancel'));
    expect(onCancelCreate).toHaveBeenCalledTimes(1);
  });

  it('disables create cancel while creating', () => {
    const onCancelCreate = vi.fn();
    const tree = renderView({
      showCreateForm: true,
      createForm: { name: '', priceInput: '', durationInput: '', description: '', error: null, isCreating: true },
      onCancelCreate,
    });
    pressButton(tree, 'services-create-cancel');
    expect(onCancelCreate).not.toHaveBeenCalled();
  });

  it('renders search input and clear button', () => {
    const onClearSearch = vi.fn();
    const tree = renderView({ searchQuery: 'classic', onClearSearch });

    expect(textInInput(findByTestId(tree, 'services-search-input'))).toBe('classic');
    const clearButton = findByTestId(tree, 'services-search-clear');
    expect(clearButton).toBeDefined();
    press(clearButton);
    expect(onClearSearch).toHaveBeenCalledTimes(1);
  });

  it('calls onSearchChange when search input changes', () => {
    const onSearchChange = vi.fn();
    const tree = renderView({ onSearchChange });
    changeText(findByDisplayName(findByTestId(tree, 'services-search-input'), 'TextInput'), 'beard');
    expect(onSearchChange).toHaveBeenCalledWith('beard');
  });

  it('renders filter chips with counts', () => {
    const tree = renderView({ statusCounts: { ACTIVE: 3, INACTIVE: 2, ALL: 5 } });
    expect(findByTestId(tree, 'services-filter-bar')).toBeDefined();
    expect(findByText(tree, 'Active (3)')).toBeDefined();
    expect(findByText(tree, 'Inactive (2)')).toBeDefined();
    expect(findByText(tree, 'All (5)')).toBeDefined();
  });

  it('calls onFilterChange when a filter chip is pressed', () => {
    const onFilterChange = vi.fn();
    const tree = renderView({ onFilterChange });
    press(findByTestId(tree, 'services-filter-inactive'));
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith('INACTIVE');
  });

  it('renders service rows with name, price, duration and status', () => {
    const tree = renderView({ visibleServices: SERVICES });
    expect(findByTestId(tree, 'services-list')).toBeDefined();
    expect(findByTestId(tree, 'service-svc-1')).toBeDefined();
    expect(findByTestId(tree, 'service-svc-2')).toBeDefined();
    expect(findByText(tree, 'Classic Cut')).toBeDefined();
    expect(findByText(tree, formatCentsForDisplay(500000))).toBeDefined();
    expect(findByText(tree, '30 min')).toBeDefined();
    expect(findByText(tree, 'Active')).toBeDefined();
    expect(findByText(tree, 'Inactive')).toBeDefined();
    expect(findByText(tree, 'Scissors and clippers')).toBeDefined();
  });

  it('calls onStartEditing when the edit button is pressed', () => {
    const onStartEditing = vi.fn();
    const tree = renderView({ visibleServices: SERVICES, onStartEditing });
    press(findByTestId(tree, 'service-edit-button-svc-1'));
    expect(onStartEditing).toHaveBeenCalledTimes(1);
    expect(onStartEditing).toHaveBeenCalledWith(SERVICES[0]);
  });

  it('calls onToggleActive when the toggle button is pressed', () => {
    const onToggleActive = vi.fn();
    const tree = renderView({ visibleServices: SERVICES, onToggleActive });
    press(findByTestId(tree, 'service-toggle-svc-1'));
    expect(onToggleActive).toHaveBeenCalledTimes(1);
    expect(onToggleActive).toHaveBeenCalledWith(SERVICES[0]);
  });

  it('renders the edit form inline for the editing service', () => {
    const tree = renderView({
      visibleServices: SERVICES,
      editForm: {
        serviceId: 'svc-1',
        name: 'Updated Cut',
        priceInput: '5500',
        durationInput: '45',
        description: 'Updated description',
        error: 'Invalid price.',
        isUpdating: false,
      },
    });

    expect(findByTestId(tree, 'service-edit-svc-1')).toBeDefined();
    expect(queryByTestId(tree, 'service-edit-svc-2')).toBeNull();
    expect(textInInput(findByTestId(tree, 'service-edit-name-svc-1'))).toBe('Updated Cut');
    expect(textInInput(findByTestId(tree, 'service-edit-price-svc-1'))).toBe('5500');
    expect(textInInput(findByTestId(tree, 'service-edit-duration-svc-1'))).toBe('45');
    expect(textInInput(findByTestId(tree, 'service-edit-description-svc-1'))).toBe('Updated description');
    expect(findByTestId(tree, 'service-edit-error-svc-1')).toBeDefined();
    expect(findByText(tree, 'Invalid price.')).toBeDefined();
    expect(findByTestId(tree, 'service-edit-submit-svc-1')).toBeDefined();
    expect(findByTestId(tree, 'service-edit-cancel-svc-1')).toBeDefined();
  });

  it('calls edit form change handlers and actions', () => {
    const onEditNameChange = vi.fn();
    const onEditPriceChange = vi.fn();
    const onEditDurationChange = vi.fn();
    const onEditDescriptionChange = vi.fn();
    const onUpdate = vi.fn();
    const onCancelEditing = vi.fn();

    const tree = renderView({
      visibleServices: SERVICES,
      editForm: {
        serviceId: 'svc-1',
        name: '',
        priceInput: '',
        durationInput: '',
        description: '',
        error: null,
        isUpdating: false,
      },
      onEditNameChange,
      onEditPriceChange,
      onEditDurationChange,
      onEditDescriptionChange,
      onUpdate,
      onCancelEditing,
    });

    changeText(findByDisplayName(findByTestId(tree, 'service-edit-name-svc-1'), 'TextInput'), 'X');
    expect(onEditNameChange).toHaveBeenCalledWith('X');

    changeText(findByDisplayName(findByTestId(tree, 'service-edit-price-svc-1'), 'TextInput'), '1');
    expect(onEditPriceChange).toHaveBeenCalledWith('1');

    changeText(findByDisplayName(findByTestId(tree, 'service-edit-duration-svc-1'), 'TextInput'), '2');
    expect(onEditDurationChange).toHaveBeenCalledWith('2');

    changeText(
      findByDisplayName(findByTestId(tree, 'service-edit-description-svc-1'), 'TextInput'),
      'Y',
    );
    expect(onEditDescriptionChange).toHaveBeenCalledWith('Y');

    press(findByTestId(tree, 'service-edit-submit-svc-1'));
    expect(onUpdate).toHaveBeenCalledTimes(1);

    press(findByTestId(tree, 'service-edit-cancel-svc-1'));
    expect(onCancelEditing).toHaveBeenCalledTimes(1);
  });

  it('disables edit cancel while updating', () => {
    const onCancelEditing = vi.fn();
    const tree = renderView({
      visibleServices: SERVICES,
      editForm: {
        serviceId: 'svc-1',
        name: '',
        priceInput: '',
        durationInput: '',
        description: '',
        error: null,
        isUpdating: true,
      },
      onCancelEditing,
    });
    pressButton(tree, 'service-edit-cancel-svc-1');
    expect(onCancelEditing).not.toHaveBeenCalled();
  });

  it('renders a services loading state', () => {
    const tree = renderView({ isServicesLoading: true, visibleServices: [] });
    expect(findByDisplayName(tree, 'ActivityIndicator')).toBeDefined();
    expect(findByText(tree, 'Loading services…')).toBeDefined();
  });

  it('renders a services error state', () => {
    const tree = renderView({ servicesError: 'Services failed', visibleServices: [] });
    expect(findByTestId(tree, 'services-error')).toBeDefined();
    expect(findByText(tree, 'Services failed')).toBeDefined();
  });

  it('renders an empty state when no services match', () => {
    const tree = renderView({ visibleServices: [], searchQuery: 'beard' });
    expect(findByTestId(tree, 'services-empty')).toBeDefined();
    expect(findByText(tree, 'No services match your search.')).toBeDefined();
  });

  it('renders an empty state for the active filter', () => {
    const tree = renderView({ visibleServices: [], statusFilter: 'ACTIVE' });
    expect(findByTestId(tree, 'services-empty')).toBeDefined();
    expect(findByText(tree, 'No active services.')).toBeDefined();
  });

  it('calls onBack when the back button is pressed', () => {
    const onBack = vi.fn();
    const tree = renderView({ onBack });
    press(findByTestId(tree, 'services-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
