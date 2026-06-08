/**
 * BarberApp Mobile — Type definitions
 *
 * Mirrors backend types until @barberapp/shared is built and linked.
 */

/**
 * User role — matches Prisma UserRole enum.
 * OWNER: Barbershop owner. Can manage barbershop, employees, services.
 * BARBER: Employee who can manage service records.
 * CLIENT: End user who books appointments.
 */
export type UserRole = 'OWNER' | 'BARBER' | 'CLIENT';
export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'OTHER';

/**
 * Current user context — returned by GET /api/v1/me/context.
 *
 * barbershopId/employeeId are nullable because:
 * - OWNER may not have a barbershop yet (just signed up).
 * - BARBER may not have an employee record yet.
 * - CLIENT has no barbershop or employee context.
 */
export interface CurrentUserContext {
  userId: string;
  role: UserRole;
  barbershopId: string | null;
  barbershopName: string | null;
  employeeId: string | null;
  employeeName: string | null;
}

// ============================================
// Daily summary types — mirror backend response shapes
// ============================================

/**
 * Payment method breakdown — shared by OWNER and BARBER summaries.
 * paymentMethod is nullable because records can have no payment method set.
 */
export interface PaymentMethodSummary {
  paymentMethod: string | null;
  recordsCount: number;
  revenueCents: number;
}

/**
 * Employee breakdown — appears in OWNER's barbershop daily summary.
 */
export interface EmployeeSummary {
  employeeId: string;
  employeeName: string | null;
  recordsCount: number;
  revenueCents: number;
}

/**
 * OWNER barbershop daily summary — returned by
 * GET /api/v1/barbershops/:barbershopId/service-records/summary?date=
 */
export interface BarbershopDailySummary {
  date: string;
  totalRecords: number;
  totalRevenueCents: number;
  byEmployee: EmployeeSummary[];
  byPaymentMethod: PaymentMethodSummary[];
}

/**
 * BARBER/employee daily summary — returned by
 * GET /api/v1/barbershops/:barbershopId/employees/:employeeId/service-records/summary?date=
 */
export interface EmployeeDailySummary {
  date: string;
  employeeId: string;
  employeeName: string | null;
  totalRecords: number;
  totalRevenueCents: number;
  byPaymentMethod: PaymentMethodSummary[];
}

/** Union type — the store holds either OWNER or BARBER summary. */
export type DailySummary = BarbershopDailySummary | EmployeeDailySummary;

// ============================================
// Employee + service types for owner record creation
// ============================================

export interface EmployeeListItem {
  id: string;
  barbershopId: string;
  userId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    role: UserRole;
  };
}

export interface Service {
  id: string;
  barbershopId?: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
  currency: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateServiceInput {
  name: string;
  durationMinutes: number;
  priceCents: number;
  description?: string;
}

export interface UpdateServiceInput {
  name?: string;
  durationMinutes?: number;
  priceCents?: number;
  description?: string;
  isActive?: boolean;
}

export interface CreateServiceRecordInput {
  employeeId: string;
  serviceId: string;
  priceCents: number;
  clientName?: string;
  paymentMethod?: PaymentMethod;
  notes?: string;
}

export interface ServiceRecord {
  id: string;
  barbershopId: string;
  employeeId: string;
  serviceId: string;
  appointmentId: string | null;
  clientName: string | null;
  priceCents: number;
  paymentMethod: PaymentMethod | null;
  notes: string | null;
  performedAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  service: {
    id: string;
    name: string;
  };
  employee: {
    id: string;
    user: {
      id: string;
      name: string | null;
    };
  };
}
