import type { Barbershop, Prisma, PrismaClient, User, UserRole } from '@prisma/client';

import {
  DEFAULT_QA_BARBERSHOP_PHONE,
  DEFAULT_QA_BARBERSHOP_TIMEZONE,
  type QaActorConfig,
  type QaBootstrapConfig,
  maskClerkUserId,
  maskEmail,
  resolveCandidate,
} from '../lib/qaBootstrap.js';

type DbClient = PrismaClient | Prisma.TransactionClient;

interface QaUserSummary {
  id: string;
  role: UserRole;
  email: string;
  name: string | null;
  clerkUserId: string;
}

interface QaBootstrapResult {
  qaBarbershopId: string;
  qaBarbershopName: string;
  owner: QaUserSummary;
  barber: QaUserSummary;
  employeeId: string;
  ownerActiveBarbershopCount: number;
  barberActiveEmployeeCount: number;
}

export interface QaVerifyResult extends QaBootstrapResult {
  ownerEmployeeId: null;
}

async function findQaBarbershops(
  db: DbClient,
  qaBarbershopName: string,
) {
  return db.barbershop.findMany({
    where: {
      name: qaBarbershopName,
      deletedAt: null,
    },
    include: {
      owner: true,
      employees: {
        where: { deletedAt: null },
        include: { user: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
}

async function findUsersBySignals(
  db: DbClient,
  actor: QaActorConfig,
) {
  const [clerkMatches, managedEmailMatches, desiredEmailMatches] = await Promise.all([
    db.user.findMany({
      where: { clerkUserId: actor.clerkUserId },
      include: {
        employees: {
          where: { deletedAt: null },
        },
        ownedBarbershops: {
          where: { deletedAt: null },
        },
      },
    }),
    db.user.findMany({
      where: { email: actor.managedEmail },
      include: {
        employees: {
          where: { deletedAt: null },
        },
        ownedBarbershops: {
          where: { deletedAt: null },
        },
      },
    }),
    actor.desiredEmail
      ? db.user.findMany({
        where: { email: actor.desiredEmail },
        include: {
          employees: {
            where: { deletedAt: null },
          },
          ownedBarbershops: {
            where: { deletedAt: null },
          },
        },
      })
      : Promise.resolve([]),
  ]);

  return { clerkMatches, managedEmailMatches, desiredEmailMatches };
}

function assertSingleOrNone<T>(
  rows: T[],
  label: string,
): T | null {
  if (rows.length > 1) {
    throw new Error(`Ambiguous ${label}: expected at most one row, found ${rows.length}.`);
  }

  return rows[0] ?? null;
}

function summarizeUser(user: User): QaUserSummary {
  return {
    id: user.id,
    role: user.role,
    email: user.email,
    name: user.name,
    clerkUserId: user.clerkUserId,
  };
}

function buildUserCreateData(
  actor: QaActorConfig,
  role: UserRole,
): Prisma.UserCreateInput {
  return {
    clerkUserId: actor.clerkUserId,
    email: actor.desiredEmail ?? actor.managedEmail,
    name: actor.desiredName ?? actor.defaultName,
    role,
    deletedAt: null,
  };
}

function buildUserUpdateData(
  user: User,
  role: UserRole,
  actor: QaActorConfig,
): Prisma.UserUpdateInput {
  const email = actor.desiredEmail ?? user.email ?? actor.managedEmail;
  const name = actor.desiredName ?? user.name ?? actor.defaultName;

  return {
    clerkUserId: actor.clerkUserId,
    email,
    name,
    role,
    deletedAt: null,
  };
}

async function ensureOwnerUser(
  tx: Prisma.TransactionClient,
  config: QaBootstrapConfig,
  qaBarbershop: (Barbershop & { owner: User }) | null,
): Promise<User> {
  const ownerSignals = await findUsersBySignals(tx, config.owner);
  const ownerByClerk = assertSingleOrNone(ownerSignals.clerkMatches, 'OWNER Clerk mapping');
  const ownerByManagedEmail = assertSingleOrNone(ownerSignals.managedEmailMatches, 'OWNER managed email mapping');
  const ownerByDesiredEmail = assertSingleOrNone(ownerSignals.desiredEmailMatches, 'OWNER desired email mapping');
  const qaBarbershopOwner = qaBarbershop?.owner ?? null;

  if (qaBarbershopOwner && ownerByClerk && ownerByClerk.id !== qaBarbershopOwner.id) {
    throw new Error(
      `Refusing to reassign QA barbershop owner: configured OWNER Clerk ID ${maskClerkUserId(config.owner.clerkUserId)} already belongs to another local user.`,
    );
  }

  const ownerCandidate = resolveCandidate({
    pinnedMatches: qaBarbershopOwner ? [qaBarbershopOwner.id] : [],
    clerkIdMatches: ownerByClerk ? [ownerByClerk.id] : [],
    managedEmailMatches: [
      ...(ownerByManagedEmail ? [ownerByManagedEmail.id] : []),
      ...(ownerByDesiredEmail ? [ownerByDesiredEmail.id] : []),
    ],
  });

  if (ownerCandidate.action === 'create') {
    return tx.user.create({
      data: buildUserCreateData(config.owner, 'OWNER'),
    });
  }

  const user = await tx.user.findUnique({
    where: { id: ownerCandidate.candidateId! },
  });

  if (!user) {
    throw new Error('Resolved OWNER candidate was not found.');
  }

  return tx.user.update({
    where: { id: user.id },
    data: buildUserUpdateData(user, 'OWNER', config.owner),
  });
}

async function ensureQaBarbershop(
  tx: Prisma.TransactionClient,
  config: QaBootstrapConfig,
  owner: User,
  existingQaBarbershop: Barbershop | null,
): Promise<Barbershop> {
  if (existingQaBarbershop) {
    if (existingQaBarbershop.ownerId !== owner.id) {
      throw new Error(
        `Refusing to reassign existing QA barbershop "${config.qaBarbershopName}" to a different owner.`,
      );
    }

    return tx.barbershop.update({
      where: { id: existingQaBarbershop.id },
      data: {
        isActive: true,
        deletedAt: null,
      },
    });
  }

  return tx.barbershop.create({
    data: {
      ownerId: owner.id,
      name: config.qaBarbershopName,
      address: 'Local QA setup barbershop',
      phone: DEFAULT_QA_BARBERSHOP_PHONE,
      timezone: DEFAULT_QA_BARBERSHOP_TIMEZONE,
      isActive: true,
    },
  });
}

async function ensureBarberUser(
  tx: Prisma.TransactionClient,
  config: QaBootstrapConfig,
  qaBarbershop: Barbershop & {
    employees: Array<{ id: string; barbershopId: string; user: User }>;
  },
): Promise<User> {
  const barberSignals = await findUsersBySignals(tx, config.barber);
  const barberByClerk = assertSingleOrNone(barberSignals.clerkMatches, 'BARBER Clerk mapping');
  const barberByManagedEmail = assertSingleOrNone(barberSignals.managedEmailMatches, 'BARBER managed email mapping');
  const barberByDesiredEmail = assertSingleOrNone(barberSignals.desiredEmailMatches, 'BARBER desired email mapping');

  const qaBarberEmployeeByClerk = qaBarbershop.employees.find(
    (employee) => employee.user.clerkUserId === config.barber.clerkUserId,
  ) ?? null;
  const qaBarberEmployeeByManagedEmail = qaBarbershop.employees.find(
    (employee) => employee.user.email === config.barber.managedEmail,
  ) ?? null;

  const barberCandidate = resolveCandidate({
    pinnedMatches: [
      ...(qaBarberEmployeeByClerk ? [qaBarberEmployeeByClerk.user.id] : []),
      ...(qaBarberEmployeeByManagedEmail ? [qaBarberEmployeeByManagedEmail.user.id] : []),
    ],
    clerkIdMatches: barberByClerk ? [barberByClerk.id] : [],
    managedEmailMatches: [
      ...(barberByManagedEmail ? [barberByManagedEmail.id] : []),
      ...(barberByDesiredEmail ? [barberByDesiredEmail.id] : []),
    ],
  });

  if (barberByClerk) {
    const nonQaEmployeeMatches = barberByClerk.employees.filter(
      (employee) => employee.barbershopId !== qaBarbershop.id,
    );
    if (nonQaEmployeeMatches.length > 0) {
      throw new Error(
        `Configured BARBER Clerk ID ${maskClerkUserId(config.barber.clerkUserId)} is already linked to another active employee record outside the QA barbershop.`,
      );
    }
  }

  if (barberCandidate.action === 'create') {
    return tx.user.create({
      data: buildUserCreateData(config.barber, 'BARBER'),
    });
  }

  const user = await tx.user.findUnique({
    where: { id: barberCandidate.candidateId! },
  });

  if (!user) {
    throw new Error('Resolved BARBER candidate was not found.');
  }

  return tx.user.update({
    where: { id: user.id },
    data: buildUserUpdateData(user, 'BARBER', config.barber),
  });
}

async function ensureBarberEmployee(
  tx: Prisma.TransactionClient,
  qaBarbershopId: string,
  barberUser: User,
): Promise<{ id: string }> {
  const existingEmployee = await tx.employee.findFirst({
    where: {
      barbershopId: qaBarbershopId,
      userId: barberUser.id,
    },
    orderBy: { createdAt: 'asc' },
  });

  if (existingEmployee) {
    return tx.employee.update({
      where: { id: existingEmployee.id },
      data: {
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });
  }

  return tx.employee.create({
    data: {
      barbershopId: qaBarbershopId,
      userId: barberUser.id,
      isActive: true,
    },
    select: { id: true },
  });
}

async function loadOwnerActiveBarbershopCount(
  db: DbClient,
  ownerUserId: string,
): Promise<number> {
  return db.barbershop.count({
    where: {
      ownerId: ownerUserId,
      isActive: true,
      deletedAt: null,
    },
  });
}

async function loadBarberActiveEmployeeCount(
  db: DbClient,
  barberUserId: string,
): Promise<number> {
  return db.employee.count({
    where: {
      userId: barberUserId,
      isActive: true,
      deletedAt: null,
    },
  });
}

function assertBootstrapResultIntegrity(
  result: QaBootstrapResult,
): void {
  if (result.owner.role !== 'OWNER') {
    throw new Error('QA bootstrap integrity failure: OWNER role was not preserved.');
  }

  if (result.barber.role !== 'BARBER') {
    throw new Error('QA bootstrap integrity failure: BARBER role was not preserved.');
  }

  if (result.ownerActiveBarbershopCount !== 1) {
    throw new Error(
      `QA bootstrap integrity failure: expected exactly one active OWNER barbershop, found ${result.ownerActiveBarbershopCount}.`,
    );
  }

  if (result.barberActiveEmployeeCount !== 1) {
    throw new Error(
      `QA bootstrap integrity failure: expected exactly one active BARBER employee record, found ${result.barberActiveEmployeeCount}.`,
    );
  }
}

export async function bootstrapLocalQaAccounts(
  prisma: PrismaClient,
  config: QaBootstrapConfig,
): Promise<QaBootstrapResult> {
  return prisma.$transaction(async (tx) => {
    const qaBarbershops = await findQaBarbershops(tx, config.qaBarbershopName);
    if (qaBarbershops.length > 1) {
      throw new Error(
        `Ambiguous QA barbershop selection: found ${qaBarbershops.length} active barbershops named "${config.qaBarbershopName}".`,
      );
    }

    const existingQaBarbershop = qaBarbershops[0] ?? null;
    const owner = await ensureOwnerUser(tx, config, existingQaBarbershop ? {
      ...existingQaBarbershop,
      owner: existingQaBarbershop.owner,
    } : null);
    const qaBarbershop = await ensureQaBarbershop(tx, config, owner, existingQaBarbershop);

    const qaBarbershopWithEmployees = await tx.barbershop.findUnique({
      where: { id: qaBarbershop.id },
      include: {
        employees: {
          where: { deletedAt: null },
          include: { user: true },
        },
      },
    });

    if (!qaBarbershopWithEmployees) {
      throw new Error('QA barbershop disappeared during bootstrap transaction.');
    }

    const barber = await ensureBarberUser(tx, config, qaBarbershopWithEmployees);
    const employee = await ensureBarberEmployee(tx, qaBarbershop.id, barber);

    const ownerActiveBarbershopCount = await loadOwnerActiveBarbershopCount(tx, owner.id);
    const barberActiveEmployeeCount = await loadBarberActiveEmployeeCount(tx, barber.id);

    const result: QaBootstrapResult = {
      qaBarbershopId: qaBarbershop.id,
      qaBarbershopName: qaBarbershop.name,
      owner: summarizeUser(owner),
      barber: summarizeUser(barber),
      employeeId: employee.id,
      ownerActiveBarbershopCount,
      barberActiveEmployeeCount,
    };

    assertBootstrapResultIntegrity(result);
    return result;
  });
}

export async function verifyLocalQaAccounts(
  prisma: PrismaClient,
  config: QaBootstrapConfig,
): Promise<QaVerifyResult> {
  const qaBarbershops = await findQaBarbershops(prisma, config.qaBarbershopName);
  if (qaBarbershops.length !== 1) {
    throw new Error(
      `Expected exactly one active QA barbershop named "${config.qaBarbershopName}", found ${qaBarbershops.length}.`,
    );
  }

  const qaBarbershop = qaBarbershops[0]!;
  const ownerMatches = await prisma.user.findMany({
    where: {
      clerkUserId: config.owner.clerkUserId,
      deletedAt: null,
    },
  });

  if (ownerMatches.length !== 1) {
    throw new Error(
      `Expected exactly one active OWNER Clerk mapping for ${maskClerkUserId(config.owner.clerkUserId)}, found ${ownerMatches.length}.`,
    );
  }

  const owner = ownerMatches[0]!;
  if (owner.role !== 'OWNER') {
    throw new Error('Configured OWNER Clerk mapping does not have OWNER role.');
  }

  if (qaBarbershop.ownerId !== owner.id) {
    throw new Error(
      `QA barbershop "${config.qaBarbershopName}" is not owned by the configured OWNER mapping.`,
    );
  }

  const barberMatches = await prisma.user.findMany({
    where: {
      clerkUserId: config.barber.clerkUserId,
      deletedAt: null,
    },
  });

  if (barberMatches.length !== 1) {
    throw new Error(
      `Expected exactly one active BARBER Clerk mapping for ${maskClerkUserId(config.barber.clerkUserId)}, found ${barberMatches.length}.`,
    );
  }

  const barber = barberMatches[0]!;
  if (barber.role !== 'BARBER') {
    throw new Error('Configured BARBER Clerk mapping does not have BARBER role.');
  }

  const ownerActiveBarbershopCount = await loadOwnerActiveBarbershopCount(prisma, owner.id);
  const barberActiveEmployees = await prisma.employee.findMany({
    where: {
      userId: barber.id,
      isActive: true,
      deletedAt: null,
    },
    orderBy: { createdAt: 'asc' },
  });

  if (barberActiveEmployees.length !== 1) {
    throw new Error(
      `Expected exactly one active BARBER employee record for ${maskClerkUserId(config.barber.clerkUserId)}, found ${barberActiveEmployees.length}.`,
    );
  }

  const employee = barberActiveEmployees[0]!;
  if (employee.barbershopId !== qaBarbershop.id) {
    throw new Error(
      `Configured BARBER employee record points at a different barbershop instead of "${config.qaBarbershopName}".`,
    );
  }

  const result: QaVerifyResult = {
    qaBarbershopId: qaBarbershop.id,
    qaBarbershopName: qaBarbershop.name,
    owner: summarizeUser(owner),
    barber: summarizeUser(barber),
    employeeId: employee.id,
    ownerEmployeeId: null,
    ownerActiveBarbershopCount,
    barberActiveEmployeeCount: barberActiveEmployees.length,
  };

  assertBootstrapResultIntegrity(result);
  return result;
}

export function formatQaBootstrapResult(
  result: QaBootstrapResult | QaVerifyResult,
): string {
  return [
    `QA barbershop: ${result.qaBarbershopName}`,
    `OWNER Clerk ID: ${maskClerkUserId(result.owner.clerkUserId)}`,
    `OWNER email: ${maskEmail(result.owner.email)}`,
    `BARBER Clerk ID: ${maskClerkUserId(result.barber.clerkUserId)}`,
    `BARBER email: ${maskEmail(result.barber.email)}`,
    `OWNER active barbershops: ${result.ownerActiveBarbershopCount}`,
    `BARBER active employee rows: ${result.barberActiveEmployeeCount}`,
    `QA employee row: ${result.employeeId}`,
  ].join('\n');
}
