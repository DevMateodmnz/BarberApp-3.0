import { describe, it, expect } from 'vitest';

import { DailySummarySection } from '@/components/DailySummarySection.js';
import { findByTestId, findByText, queryByText } from '@/testing/elementTree.js';

const today = new Date().toISOString().slice(0, 10);

const OWNER_SUMMARY = {
  byEmployee: [
    { employeeId: 'emp-1', employeeName: 'Carlos', recordsCount: 3, revenueCents: 9000 },
    { employeeId: 'emp-2', employeeName: 'Ana', recordsCount: 2, revenueCents: 6000 },
  ],
  byPaymentMethod: [
    { paymentMethod: 'CASH', recordsCount: 3, revenueCents: 8000 },
    { paymentMethod: 'CARD', recordsCount: 2, revenueCents: 7000 },
  ],
};

describe('DailySummarySection', () => {
  it('renders the title with Today when the selected date is today', () => {
    const tree = DailySummarySection({
      ...OWNER_SUMMARY,
      selectedDate: today,
      totalRecords: 5,
      totalRevenueCents: 15000,
    });
    expect(findByTestId(tree, 'summary-title')).toBeDefined();
    expect(findByText(tree, 'Daily Summary — Today')).toBeDefined();
  });

  it('renders the title with the raw date when not today', () => {
    const tree = DailySummarySection({
      ...OWNER_SUMMARY,
      selectedDate: '2026-06-01',
      totalRecords: 5,
      totalRevenueCents: 15000,
    });
    expect(findByText(tree, 'Daily Summary — 2026-06-01')).toBeDefined();
  });

  it('renders records and revenue totals', () => {
    const tree = DailySummarySection({
      ...OWNER_SUMMARY,
      selectedDate: today,
      totalRecords: 7,
      totalRevenueCents: 25000,
    });
    expect(findByText(tree, '7')).toBeDefined();
    expect(findByText(tree, '$25.000')).toBeDefined();
    expect(findByText(tree, 'Records')).toBeDefined();
    expect(findByText(tree, 'Revenue')).toBeDefined();
  });

  it('renders an empty state when there are no records', () => {
    const tree = DailySummarySection({
      ...OWNER_SUMMARY,
      selectedDate: today,
      totalRecords: 0,
      totalRevenueCents: 0,
    });
    expect(findByText(tree, 'No services recorded for this date.')).toBeDefined();
    expect(queryByText(tree, 'By Employee')).toBeNull();
    expect(queryByText(tree, 'By Payment Method')).toBeNull();
  });

  it('renders the employee breakdown for owners', () => {
    const tree = DailySummarySection({
      ...OWNER_SUMMARY,
      selectedDate: today,
      totalRecords: 5,
      totalRevenueCents: 15000,
    });
    expect(findByText(tree, 'By Employee')).toBeDefined();
    expect(findByText(tree, 'Carlos')).toBeDefined();
    expect(findByText(tree, 'Ana')).toBeDefined();
    expect(findByText(tree, '3 · $9.000')).toBeDefined();
    expect(findByText(tree, '2 · $6.000')).toBeDefined();
  });

  it('renders the payment method breakdown', () => {
    const tree = DailySummarySection({
      byEmployee: undefined,
      byPaymentMethod: OWNER_SUMMARY.byPaymentMethod,
      selectedDate: today,
      totalRecords: 5,
      totalRevenueCents: 15000,
    });
    expect(findByText(tree, 'By Payment Method')).toBeDefined();
    expect(findByText(tree, 'Cash')).toBeDefined();
    expect(findByText(tree, 'Card')).toBeDefined();
    expect(findByText(tree, '3 · $8.000')).toBeDefined();
    expect(findByText(tree, '2 · $7.000')).toBeDefined();
  });
});
