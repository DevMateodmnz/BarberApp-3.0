/**
 * BarberApp Mobile — Type definitions
 *
 * Mirrors backend types until @barberapp/shared is built and linked.
 * UserRole and CurrentUserContext correspond to the backend's
 * GET /api/v1/me/context response payload.
 */

/**
 * User role — matches Prisma UserRole enum.
 * OWNER: Barbershop owner. Can manage barbershop, employees, services.
 * BARBER: Employee who can manage service records.
 * CLIENT: End user who books appointments.
 */
export type UserRole = 'OWNER' | 'BARBER' | 'CLIENT';

/**
 * Current user context — returned by GET /api/v1/me/context.
 *
 * ownerId/barbershopId/employeeId are all nullable because:
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