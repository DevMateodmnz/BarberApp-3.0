import { describe, expect, it, vi } from 'vitest';

import { PaymentReviewDetailScreenView } from '@/components/PaymentReviewDetailScreenView.js';
import type { PaymentReviewDetail } from '@/lib/types.js';
import {
  findByDisplayName,
  findByTestId,
  findByText,
  press,
} from '@/testing/elementTree.js';

function makeDetail(overrides: Partial<PaymentReviewDetail> = {}): PaymentReviewDetail {
  return {
    id: 'review-1',
    payment: {
      id: 'payment-1',
      amountCents: 1500,
      currency: 'ARS',
      status: 'APPROVED',
      providerStatus: 'approved',
      providerStatusDetail: 'accredited',
      approvedAt: '2026-07-16T10:00:00.000Z',
      rejectedAt: null,
      cancelledAt: null,
      expiredAt: null,
      reviewRequiredAt: '2026-07-16T10:05:00.000Z',
    },
    appointment: {
      id: 'appt-1',
      publicReference: 'pb_TEST123',
      customerDisplayName: 'Juan Pérez',
      serviceName: 'Corte clásico',
      startAt: '2026-07-17T13:00:00.000Z',
      endAt: '2026-07-17T13:30:00.000Z',
      status: 'CANCELLED',
    },
    review: {
      status: 'OPEN',
      reason: 'APPROVED_PAYMENT_ON_CANCELLED_APPOINTMENT',
      resolution: null,
      openedAt: '2026-07-16T10:05:00.000Z',
      startedAt: null,
      resolvedAt: null,
      assignedToDisplayName: null,
      latestNote: null,
    },
    timeline: [
      {
        type: 'PAYMENT_REVIEW_OPENED',
        occurredAt: '2026-07-16T10:05:00.000Z',
        label: 'Caso de revisión abierto',
        detail: 'Pago aprobado en un turno cancelado',
      },
    ],
    actions: [
      {
        id: 'action-1',
        action: 'OPENED',
        actorDisplayName: null,
        actorRole: null,
        note: null,
        resolution: null,
        createdAt: '2026-07-16T10:05:00.000Z',
      },
    ],
    providerEvents: [],
    allowedActions: {
      canStart: true,
      canAddNote: true,
      canResolve: true,
      canReopen: false,
    },
    ...overrides,
  };
}

function renderView(overrides: Partial<Parameters<typeof PaymentReviewDetailScreenView>[0]> = {}) {
  return PaymentReviewDetailScreenView({
    detail: makeDetail(),
    isLoading: false,
    error: null,
    isSubmitting: false,
    actionMessage: null,
    noteDraft: 'Cliente contactado por WhatsApp',
    onChangeNote: vi.fn(),
    selectedResolution: 'REFUNDED_EXTERNALLY',
    onSelectResolution: vi.fn(),
    onBack: vi.fn(),
    onRefresh: vi.fn(),
    onStart: vi.fn(),
    onAddNote: vi.fn(),
    onResolve: vi.fn(),
    onReopen: vi.fn(),
    ...overrides,
  });
}

describe('PaymentReviewDetailScreenView', () => {
  it('keeps note actions tappable while the keyboard is visible', () => {
    const tree = renderView();
    const scrollView = findByDisplayName(tree, 'ScrollView');

    expect((scrollView as {
      props: { keyboardShouldPersistTaps?: string };
    }).props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('renders loading and error states without detail data', () => {
    const loadingTree = renderView({ detail: null, isLoading: true });
    expect(findByTestId(loadingTree, 'payment-review-detail-loading')).toBeDefined();

    const onRefresh = vi.fn();
    const errorTree = renderView({
      detail: null,
      error: 'Load failed',
      onRefresh,
    });
    press(findByTestId(errorTree, 'payment-review-detail-error-retry'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('renders the summary, actions, timeline, and external refund warning', () => {
    const onStart = vi.fn();
    const onAddNote = vi.fn();
    const onResolve = vi.fn();
    const tree = renderView({ onStart, onAddNote, onResolve, actionMessage: 'Guardado' });

    expect(findByTestId(tree, 'payment-review-detail-summary')).toBeDefined();
    expect(findByText(tree, 'Juan Pérez')).toBeDefined();
    expect(findByTestId(tree, 'payment-review-external-refund-warning')).toBeDefined();
    expect(findByTestId(tree, 'payment-review-action-action-1')).toBeDefined();

    press(findByTestId(tree, 'payment-review-start'));
    press(findByTestId(tree, 'payment-review-add-note'));
    press(findByTestId(tree, 'payment-review-resolve'));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onAddNote).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledTimes(1);
  });
});
