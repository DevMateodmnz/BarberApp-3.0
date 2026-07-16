import crypto from 'node:crypto';

import { Prisma } from '@prisma/client';
import type { UserRole } from '@prisma/client';

import { normalizeEmail } from '../lib/email.js';
import { NotFoundError } from '../lib/errors.js';
import { tryNormalizeClientPhoneE164 } from '../lib/phoneNormalization.js';
import { prisma } from '../lib/prisma.js';
import { getCustomerLoyaltySummary } from './loyaltyService.js';

export type CustomerDb = Prisma.TransactionClient | typeof prisma;

const CUSTOMER_NOTES_MAX_LENGTH = 2000;
const DEFAULT_RECENT_LIMIT = 20;
const DEFAULT_UPCOMING_LIMIT = 5;

export interface UserTenantContext {
  userId: string;
  userRole: UserRole;
}

export interface UpsertCustomerInput {
  barbershopId: string;
  phone: string;
  name?: string | null;
  email?: string | null;
  appointmentAt: Date;
  db: CustomerDb;
}

export interface UpsertCustomerResult {
  customer: {
    id: string;
    name: string;
    phone: string;
    phoneNormalized: string;
    email: string | null;
  };
  created: boolean;
}

export interface LinkExistingCustomerInput {
  barbershopId: string;
  customerId: string;
  name?: string | null;
  email?: string | null;
  appointmentAt: Date;
  db: CustomerDb;
}

export interface CustomerListItem {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  upcomingCount: number;
  lastServiceName: string | null;
  lastEmployeeName: string | null;
}

export interface ListCustomersInput {
  barbershopId: string;
  search?: string;
  sort?: 'recent' | 'name' | 'no_shows';
  limit: number;
  offset: number;
  user: UserTenantContext;
}

export interface ListCustomersResult {
  items: CustomerListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface CustomerDetailInput {
  barbershopId: string;
  customerId: string;
  recentLimit?: number;
  upcomingLimit?: number;
  user: UserTenantContext;
}

export interface CustomerDetailResult {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  internalNotes: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  upcomingCount: number;
  lastServiceName: string | null;
  lastEmployeeName: string | null;
  loyalty: {
    programEnabled: boolean;
    visitsRequired: number | null;
    currentStampCount: number;
    lifetimeEligibleVisits: number;
    availableRewardCount: number;
    lastEarnedAt: string | null;
    rewards: Array<{
      id: string;
      code: string;
      status: string;
      issuedAt: string;
      expiresAt: string | null;
      redeemedAt: string | null;
      revokedAt: string | null;
      promotionName: string;
    }>;
  };
  recentAppointments: Array<{
    id: string;
    startAt: string;
    endAt: string;
    status: string;
    serviceName: string;
    employeeName: string | null;
    confirmedAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
    cancelledAt: string | null;
    noShowAt: string | null;
    cancellationSource: string | null;
  }>;
  upcomingAppointments: Array<{
    id: string;
    startAt: string;
    endAt: string;
    status: string;
    serviceName: string;
    employeeName: string | null;
  }>;
}

export interface UpdateCustomerInput {
  barbershopId: string;
  customerId: string;
  name?: string | null;
  email?: string | null;
  internalNotes?: string | null;
  user: UserTenantContext;
}

export interface UpdateCustomerResult {
  id: string;
  name: string;
  email: string | null;
  internalNotes: string | null;
  lastSeenAt: string;
}

interface CustomerDirectoryRow {
  id: string;
  name: string;
  phone: string;
  phoneNormalized: string;
  email: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  deletedAt: Date | null;
}

function normalizeOptionalText(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function coerceCount(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function normalizePhoneDigits(value: string): string {
  return value.replace(/\D/g, '');
}

async function assertTenantCanReadCustomers(
  barbershopId: string,
  ctx: UserTenantContext
): Promise<void> {
  if (ctx.userRole === 'OWNER') {
    const shop = await prisma.barbershop.findUnique({
      where: { id: barbershopId },
      select: { ownerId: true },
    });

    if (!shop || shop.ownerId !== ctx.userId) {
      throw new NotFoundError('Barbershop');
    }

    return;
  }

  if (ctx.userRole === 'BARBER') {
    const employee = await prisma.employee.findFirst({
      where: {
        userId: ctx.userId,
        barbershopId,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!employee) {
      throw new NotFoundError('Barbershop');
    }

    return;
  }

  throw new NotFoundError('Barbershop');
}

async function updateCustomerDirectoryState(
  db: CustomerDb,
  customer: CustomerDirectoryRow,
  input: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    appointmentAt: Date;
    allowPhoneOverwrite: boolean;
  }
): Promise<UpsertCustomerResult['customer']> {
  const incomingName = normalizeOptionalText(input.name);
  const incomingPhone = normalizeOptionalText(input.phone);
  const incomingEmailRaw = normalizeOptionalText(input.email);
  const incomingEmail = incomingEmailRaw ? normalizeEmail(incomingEmailRaw) : null;

  const nextFirstSeenAt =
    input.appointmentAt.getTime() < customer.firstSeenAt.getTime()
      ? input.appointmentAt
      : customer.firstSeenAt;
  const nextLastSeenAt =
    input.appointmentAt.getTime() > customer.lastSeenAt.getTime()
      ? input.appointmentAt
      : customer.lastSeenAt;

  const data: Prisma.CustomerUpdateInput = {
    firstSeenAt: nextFirstSeenAt,
    lastSeenAt: nextLastSeenAt,
  };

  if (customer.deletedAt) {
    data.deletedAt = null;
  }

  if (incomingName && incomingName !== customer.name) {
    data.name = incomingName;
  }

  if (incomingEmail && incomingEmail !== customer.email) {
    data.email = incomingEmail;
  }

  if (
    input.allowPhoneOverwrite
    && incomingPhone
    && incomingPhone !== customer.phone
  ) {
    data.phone = incomingPhone;
  }

  const updated = await db.customer.update({
    where: { id: customer.id },
    data,
    select: {
      id: true,
      name: true,
      phone: true,
      phoneNormalized: true,
      email: true,
    },
  });

  return updated;
}

async function atomicUpsertCustomerByPhone(
  db: CustomerDb,
  input: {
    barbershopId: string;
    phone: string;
    phoneNormalized: string;
    name?: string | null;
    email?: string | null;
    appointmentAt: Date;
  }
): Promise<UpsertCustomerResult> {
  const incomingName = normalizeOptionalText(input.name);
  const incomingPhone = normalizeOptionalText(input.phone);
  const incomingEmailRaw = normalizeOptionalText(input.email);
  const incomingEmail = incomingEmailRaw ? normalizeEmail(incomingEmailRaw) : null;

  const rows = await db.$queryRaw<
    Array<{
      id: string;
      name: string;
      phone: string;
      phone_normalized: string;
      email: string | null;
      inserted: boolean;
    }>
  >(Prisma.sql`
    INSERT INTO customers (
      id,
      barbershop_id,
      name,
      phone,
      phone_normalized,
      email,
      internal_notes,
      first_seen_at,
      last_seen_at,
      created_at,
      updated_at,
      deleted_at
    ) VALUES (
      ${`cust_${crypto.randomUUID().replace(/-/g, '').slice(0, 28)}`},
      ${input.barbershopId},
      ${incomingName ?? input.phoneNormalized},
      ${input.phone.trim()},
      ${input.phoneNormalized},
      ${incomingEmail},
      NULL,
      ${input.appointmentAt},
      ${input.appointmentAt},
      NOW(),
      NOW(),
      NULL
    )
    ON CONFLICT (barbershop_id, phone_normalized)
    DO UPDATE SET
      first_seen_at = LEAST(customers.first_seen_at, EXCLUDED.first_seen_at),
      last_seen_at = GREATEST(customers.last_seen_at, EXCLUDED.last_seen_at),
      name = CASE
        WHEN CAST(${incomingName} AS TEXT) IS NOT NULL
          AND CAST(${incomingName} AS TEXT) <> customers.name
          THEN CAST(${incomingName} AS TEXT)
        ELSE customers.name
      END,
      email = CASE
        WHEN CAST(${incomingEmail} AS TEXT) IS NOT NULL
          AND CAST(${incomingEmail} AS TEXT) <> customers.email
          THEN CAST(${incomingEmail} AS TEXT)
        ELSE customers.email
      END,
      phone = CASE
        WHEN CAST(${incomingPhone} AS TEXT) IS NOT NULL
          AND CAST(${incomingPhone} AS TEXT) <> customers.phone
          THEN CAST(${incomingPhone} AS TEXT)
        ELSE customers.phone
      END,
      deleted_at = NULL,
      updated_at = NOW()
    RETURNING
      id,
      name,
      phone,
      phone_normalized,
      email,
      (xmax = 0) AS inserted
  `);

  const row = rows[0];
  if (!row) {
    throw new Error('Customer upsert did not return a row');
  }

  return {
    customer: {
      id: row.id,
      name: row.name,
      phone: row.phone,
      phoneNormalized: row.phone_normalized,
      email: row.email,
    },
    created: row.inserted,
  };
}

export async function upsertCustomerByPhone(
  input: UpsertCustomerInput
): Promise<UpsertCustomerResult> {
  const phoneNormalized = tryNormalizeClientPhoneE164(input.phone);
  if (!phoneNormalized) {
    throw new Error('upsertCustomerByPhone requires an E.164 phone');
  }

  const existing = await input.db.customer.findFirst({
    where: {
      barbershopId: input.barbershopId,
      phoneNormalized,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      phoneNormalized: true,
      email: true,
      firstSeenAt: true,
      lastSeenAt: true,
      deletedAt: true,
    },
  });

  if (existing) {
    return {
      customer: await updateCustomerDirectoryState(input.db, existing, {
        name: input.name,
        email: input.email,
        phone: input.phone,
        appointmentAt: input.appointmentAt,
        allowPhoneOverwrite: true,
      }),
      created: false,
    };
  }

  return atomicUpsertCustomerByPhone(input.db, {
    barbershopId: input.barbershopId,
    phone: input.phone,
    phoneNormalized,
    name: input.name,
    email: input.email,
    appointmentAt: input.appointmentAt,
  });
}

export async function linkAppointmentToExistingCustomer(
  input: LinkExistingCustomerInput
): Promise<UpsertCustomerResult['customer']> {
  const customer = await input.db.customer.findFirst({
    where: {
      id: input.customerId,
      barbershopId: input.barbershopId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      phoneNormalized: true,
      email: true,
      firstSeenAt: true,
      lastSeenAt: true,
      deletedAt: true,
    },
  });

  if (!customer) {
    throw new NotFoundError('Customer');
  }

  return updateCustomerDirectoryState(input.db, customer, {
    name: input.name,
    email: input.email,
    phone: null,
    appointmentAt: input.appointmentAt,
    allowPhoneOverwrite: false,
  });
}

function buildCustomerSearchClause(search?: string): Prisma.Sql {
  const query = (search ?? '').trim();
  if (!query) {
    return Prisma.empty;
  }

  const digits = normalizePhoneDigits(query);
  if (digits.length >= 4) {
    return Prisma.sql`
      AND (
        c.name ILIKE ${`%${query}%`}
        OR regexp_replace(c.phone_normalized, '[^0-9]', '', 'g') LIKE ${`%${digits}%`}
      )
    `;
  }

  return Prisma.sql`
    AND c.name ILIKE ${`%${query}%`}
  `;
}

export async function listCustomers(
  input: ListCustomersInput
): Promise<ListCustomersResult> {
  await assertTenantCanReadCustomers(input.barbershopId, input.user);

  const limit = Math.min(Math.max(input.limit, 1), 100);
  const offset = Math.max(input.offset, 0);
  const now = new Date();
  const searchClause = buildCustomerSearchClause(input.search);
  const orderBy =
    input.sort === 'name'
      ? Prisma.sql`c.name ASC, c.id ASC`
      : input.sort === 'no_shows'
        ? Prisma.sql`
            COALESCE(agg.no_show_count, 0) DESC,
            c.last_seen_at DESC,
            c.id ASC
          `
        : Prisma.sql`c.last_seen_at DESC, c.id ASC`;

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      name: string;
      phone: string;
      email: string | null;
      first_seen_at: Date;
      last_seen_at: Date;
      completed_count: number;
      cancelled_count: number;
      no_show_count: number;
      upcoming_count: number;
      last_service_name: string | null;
      last_employee_name: string | null;
      total_count: number;
    }>
  >(Prisma.sql`
    WITH filtered_customers AS (
      SELECT
        c.id,
        c.name,
        c.phone,
        c.email,
        c.first_seen_at,
        c.last_seen_at
      FROM customers c
      WHERE c.barbershop_id = ${input.barbershopId}
        AND c.deleted_at IS NULL
        ${searchClause}
    ),
    agg AS (
      SELECT
        a.customer_id,
        COUNT(*) FILTER (WHERE a.status = 'COMPLETED')::int AS completed_count,
        COUNT(*) FILTER (WHERE a.status = 'CANCELLED')::int AS cancelled_count,
        COUNT(*) FILTER (WHERE a.status = 'NO_SHOW')::int AS no_show_count,
        COUNT(*) FILTER (
          WHERE a.status IN ('PENDING', 'CONFIRMED')
            AND a.start_at > ${now}
        )::int AS upcoming_count
      FROM appointments a
      JOIN filtered_customers c ON c.id = a.customer_id
      WHERE a.barbershop_id = ${input.barbershopId}
        AND a.deleted_at IS NULL
      GROUP BY a.customer_id
    )
    SELECT
      c.id,
      c.name,
      c.phone,
      c.email,
      c.first_seen_at,
      c.last_seen_at,
      COALESCE(agg.completed_count, 0) AS completed_count,
      COALESCE(agg.cancelled_count, 0) AS cancelled_count,
      COALESCE(agg.no_show_count, 0) AS no_show_count,
      COALESCE(agg.upcoming_count, 0) AS upcoming_count,
      last_visit.service_name AS last_service_name,
      last_visit.employee_name AS last_employee_name,
      COUNT(*) OVER ()::int AS total_count
    FROM filtered_customers c
    LEFT JOIN agg ON agg.customer_id = c.id
    LEFT JOIN LATERAL (
      SELECT
        a.service_name,
        u.name AS employee_name
      FROM appointments a
      JOIN employees e ON e.id = a.employee_id
      LEFT JOIN users u ON u.id = e.user_id
      WHERE a.customer_id = c.id
        AND a.barbershop_id = ${input.barbershopId}
        AND a.deleted_at IS NULL
        AND a.start_at <= ${now}
      ORDER BY a.start_at DESC, a.id DESC
      LIMIT 1
    ) last_visit ON TRUE
    ORDER BY ${orderBy}
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  const total = rows[0] ? coerceCount(rows[0].total_count) : 0;

  return {
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      firstSeenAt: row.first_seen_at.toISOString(),
      lastSeenAt: row.last_seen_at.toISOString(),
      completedCount: coerceCount(row.completed_count),
      cancelledCount: coerceCount(row.cancelled_count),
      noShowCount: coerceCount(row.no_show_count),
      upcomingCount: coerceCount(row.upcoming_count),
      lastServiceName: row.last_service_name,
      lastEmployeeName: row.last_employee_name,
    })),
    total,
    limit,
    offset,
  };
}

async function readCustomerCounts(
  barbershopId: string,
  customerId: string,
  now: Date
): Promise<{
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  upcomingCount: number;
}> {
  const rows = await prisma.$queryRaw<
    Array<{
      completed_count: number;
      cancelled_count: number;
      no_show_count: number;
      upcoming_count: number;
    }>
  >(Prisma.sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed_count,
      COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled_count,
      COUNT(*) FILTER (WHERE status = 'NO_SHOW')::int AS no_show_count,
      COUNT(*) FILTER (
        WHERE status IN ('PENDING', 'CONFIRMED')
          AND start_at > ${now}
      )::int AS upcoming_count
    FROM appointments
    WHERE customer_id = ${customerId}
      AND barbershop_id = ${barbershopId}
      AND deleted_at IS NULL
  `);

  const row = rows[0];
  return {
    completedCount: coerceCount(row?.completed_count),
    cancelledCount: coerceCount(row?.cancelled_count),
    noShowCount: coerceCount(row?.no_show_count),
    upcomingCount: coerceCount(row?.upcoming_count),
  };
}

async function readLastVisitedService(
  barbershopId: string,
  customerId: string,
  now: Date
): Promise<{
  lastServiceName: string | null;
  lastEmployeeName: string | null;
}> {
  const lastVisit = await prisma.appointment.findFirst({
    where: {
      barbershopId,
      customerId,
      deletedAt: null,
      startAt: { lte: now },
    },
    orderBy: [{ startAt: 'desc' }, { id: 'desc' }],
    select: {
      serviceName: true,
      employee: { select: { user: { select: { name: true } } } },
    },
  });

  return {
    lastServiceName: lastVisit?.serviceName ?? null,
    lastEmployeeName: lastVisit?.employee?.user?.name ?? null,
  };
}

export async function getCustomerDetail(
  input: CustomerDetailInput
): Promise<CustomerDetailResult | null> {
  await assertTenantCanReadCustomers(input.barbershopId, input.user);

  const recentLimit = Math.min(
    Math.max(input.recentLimit ?? DEFAULT_RECENT_LIMIT, 1),
    50
  );
  const upcomingLimit = Math.min(
    Math.max(input.upcomingLimit ?? DEFAULT_UPCOMING_LIMIT, 1),
    20
  );
  const now = new Date();

  const customer = await prisma.customer.findFirst({
    where: {
      id: input.customerId,
      barbershopId: input.barbershopId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      internalNotes: true,
      firstSeenAt: true,
      lastSeenAt: true,
    },
  });

  if (!customer) {
    return null;
  }

  const [counts, lastVisit, loyalty, recentAppointments, upcomingAppointments] =
    await Promise.all([
      readCustomerCounts(input.barbershopId, input.customerId, now),
      readLastVisitedService(input.barbershopId, input.customerId, now),
      getCustomerLoyaltySummary({
        barbershopId: input.barbershopId,
        customerId: input.customerId,
        now,
      }),
      prisma.appointment.findMany({
        where: {
          customerId: input.customerId,
          barbershopId: input.barbershopId,
          deletedAt: null,
          startAt: { lte: now },
        },
        orderBy: [{ startAt: 'desc' }, { id: 'desc' }],
        take: recentLimit,
        select: {
          id: true,
          startAt: true,
          endAt: true,
          status: true,
          serviceName: true,
          confirmedAt: true,
          startedAt: true,
          completedAt: true,
          cancelledAt: true,
          noShowAt: true,
          cancellationSource: true,
          employee: { select: { user: { select: { name: true } } } },
        },
      }),
      prisma.appointment.findMany({
        where: {
          customerId: input.customerId,
          barbershopId: input.barbershopId,
          deletedAt: null,
          status: { in: ['PENDING', 'CONFIRMED'] },
          startAt: { gt: now },
        },
        orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
        take: upcomingLimit,
        select: {
          id: true,
          startAt: true,
          endAt: true,
          status: true,
          serviceName: true,
          employee: { select: { user: { select: { name: true } } } },
        },
      }),
    ]);

  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    internalNotes: customer.internalNotes,
    firstSeenAt: customer.firstSeenAt.toISOString(),
    lastSeenAt: customer.lastSeenAt.toISOString(),
    completedCount: counts.completedCount,
    cancelledCount: counts.cancelledCount,
    noShowCount: counts.noShowCount,
    upcomingCount: counts.upcomingCount,
    lastServiceName: lastVisit.lastServiceName,
    lastEmployeeName: lastVisit.lastEmployeeName,
    loyalty: {
      programEnabled: loyalty?.programEnabled ?? false,
      visitsRequired: loyalty?.visitsRequired ?? null,
      currentStampCount: loyalty?.currentStampCount ?? 0,
      lifetimeEligibleVisits: loyalty?.lifetimeEligibleVisits ?? 0,
      availableRewardCount: loyalty?.availableRewardCount ?? 0,
      lastEarnedAt: loyalty?.lastEarnedAt ?? null,
      rewards: loyalty?.rewards ?? [],
    },
    recentAppointments: recentAppointments.map((row) => ({
      id: row.id,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      status: row.status,
      serviceName: row.serviceName,
      employeeName: row.employee?.user?.name ?? null,
      confirmedAt: row.confirmedAt?.toISOString() ?? null,
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      noShowAt: row.noShowAt?.toISOString() ?? null,
      cancellationSource: row.cancellationSource ?? null,
    })),
    upcomingAppointments: upcomingAppointments.map((row) => ({
      id: row.id,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      status: row.status,
      serviceName: row.serviceName,
      employeeName: row.employee?.user?.name ?? null,
    })),
  };
}

export async function updateCustomer(
  input: UpdateCustomerInput
): Promise<UpdateCustomerResult | null> {
  await assertTenantCanReadCustomers(input.barbershopId, input.user);

  const current = await prisma.customer.findFirst({
    where: {
      id: input.customerId,
      barbershopId: input.barbershopId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      internalNotes: true,
      lastSeenAt: true,
    },
  });

  if (!current) {
    return null;
  }

  const data: Prisma.CustomerUpdateInput = {};

  if (input.name !== undefined) {
    const name = normalizeOptionalText(input.name);
    if (!name) {
      throw new Error('Customer name cannot be empty');
    }

    data.name = name;
  }

  if (input.email !== undefined) {
    const email = normalizeOptionalText(input.email);
    data.email = email ? normalizeEmail(email) : null;
  }

  if (input.internalNotes !== undefined) {
    const notes = normalizeOptionalText(input.internalNotes);
    if ((notes ?? '').length > CUSTOMER_NOTES_MAX_LENGTH) {
      throw new Error(
        `internalNotes exceeds the ${CUSTOMER_NOTES_MAX_LENGTH}-character limit`
      );
    }

    data.internalNotes = notes ?? null;
  }

  const updated =
    Object.keys(data).length === 0
      ? current
      : await prisma.customer.update({
          where: { id: current.id },
          data,
          select: {
            id: true,
            name: true,
            email: true,
            internalNotes: true,
            lastSeenAt: true,
          },
        });

  return {
    id: updated.id,
    name: updated.name,
    email: updated.email,
    internalNotes: updated.internalNotes,
    lastSeenAt: updated.lastSeenAt.toISOString(),
  };
}
