/**
 * Database seed script
 * Creates realistic demo data for development.
 *
 * Important:
 * - The identities in this file are FAKE local demo identities only.
 * - They are intentionally not compatible with real Clerk phone-QA accounts.
 * - Real local OWNER/BARBER Clerk mappings belong to the ignored
 *   `.env.qa.local` + `npm run qa:bootstrap --workspace apps/api` workflow.
 */

import { PrismaClient, UserRole, AppointmentStatus } from '@prisma/client';
import { createBarbershop } from '../src/services/barbershopService.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  // Clean existing data
  await prisma.photo.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.employeeService.deleteMany();
  await prisma.service.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.barbershop.deleteMany();
  await prisma.user.deleteMany();

  // Create demo Owner (fake Clerk mapping by design)
  const owner = await prisma.user.create({
    data: {
      clerkUserId: 'owner_clerk_123',
      email: 'owner@barberia.com',
      name: 'Carlos Rodriguez',
      role: UserRole.OWNER,
    },
  });
  console.log('Created owner:', owner.email);

  // Create Barbershop (includes default WorkingHours setup)
  const barbershop = await createBarbershop({
    ownerId: owner.id,
    name: 'Barbería Classic',
    address: 'Av. Santa Fe 1234, Buenos Aires',
    phone: '+54 11 5555-1234',
    timezone: 'America/Argentina/Buenos_Aires',
  });
  console.log('Created barbershop:', barbershop.name);

  // Create demo Barber 1 (fake Clerk mapping by design)
  const barber1User = await prisma.user.create({
    data: {
      clerkUserId: 'barber_clerk_456',
      email: 'juan@barberia.com',
      name: 'Juan Pérez',
      role: UserRole.BARBER,
    },
  });

  const barber1 = await prisma.employee.create({
    data: {
      barbershopId: barbershop.id,
      userId: barber1User.id,
      isActive: true,
    },
  });
  console.log('Created barber:', barber1User.name);

  // Create demo Barber 2 (fake Clerk mapping by design)
  const barber2User = await prisma.user.create({
    data: {
      clerkUserId: 'barber_clerk_789',
      email: 'marcos@barberia.com',
      name: 'Marcos García',
      role: UserRole.BARBER,
    },
  });

  const barber2 = await prisma.employee.create({
    data: {
      barbershopId: barbershop.id,
      userId: barber2User.id,
      isActive: true,
    },
  });
  console.log('Created barber:', barber2User.name);

  // Create Services
  const service1 = await prisma.service.create({
    data: {
      barbershopId: barbershop.id,
      name: 'Corte Clásico',
      description: 'Corte de cabello tradicional con tijera y máquina',
      durationMinutes: 30,
      priceCents: 2500,
      currency: 'ARS',
      isActive: true,
    },
  });

  const service2 = await prisma.service.create({
    data: {
      barbershopId: barbershop.id,
      name: 'Corte + Barba',
      description: 'Corte de cabello más arreglos en la barba',
      durationMinutes: 45,
      priceCents: 4000,
      currency: 'ARS',
      isActive: true,
    },
  });

  const service3 = await prisma.service.create({
    data: {
      barbershopId: barbershop.id,
      name: 'Afeitado Clásico',
      description: 'Afeitado tradicional con navaja y espuma caliente',
      durationMinutes: 30,
      priceCents: 2000,
      currency: 'ARS',
      isActive: true,
    },
  });

  const service4 = await prisma.service.create({
    data: {
      barbershopId: barbershop.id,
      name: 'Tratamiento Capilar',
      description: 'Hidratación y tratamiento para el cuero cabelludo',
      durationMinutes: 60,
      priceCents: 5000,
      currency: 'ARS',
      isActive: true,
    },
  });
  console.log('Created 4 services');

  // Link barbers to services
  await prisma.employeeService.createMany({
    data: [
      { employeeId: barber1.id, serviceId: service1.id },
      { employeeId: barber1.id, serviceId: service2.id },
      { employeeId: barber1.id, serviceId: service3.id },
      { employeeId: barber2.id, serviceId: service1.id },
      { employeeId: barber2.id, serviceId: service2.id },
      { employeeId: barber2.id, serviceId: service4.id },
    ],
  });
  console.log('Linked barbers to services');

  // Create Clients
  const client1 = await prisma.user.create({
    data: {
      clerkUserId: 'client_clerk_101',
      email: 'cliente1@gmail.com',
      name: 'Diego Martínez',
      role: UserRole.CLIENT,
    },
  });

  const client2 = await prisma.user.create({
    data: {
      clerkUserId: 'client_clerk_102',
      email: 'cliente2@gmail.com',
      name: 'Fernando López',
      role: UserRole.CLIENT,
    },
  });

  const client3 = await prisma.user.create({
    data: {
      clerkUserId: 'client_clerk_103',
      email: 'cliente3@gmail.com',
      name: 'Santiago Kem',
      role: UserRole.CLIENT,
    },
  });
  console.log('Created 3 clients');

  // Create Appointments
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  await prisma.appointment.create({
    data: {
      barbershopId: barbershop.id,
      employeeId: barber1.id,
      clientId: client1.id,
      serviceId: service1.id,
      clientName: client1.name!,
      clientPhone: null,
      serviceName: service1.name,
      servicePriceCents: service1.priceCents,
      serviceDurationMinutes: service1.durationMinutes,
      serviceCurrency: service1.currency,
      startAt: tomorrow,
      endAt: new Date(tomorrow.getTime() + 30 * 60000),
      status: AppointmentStatus.CONFIRMED,
      notes: 'Cliente prefiere cabello corto',
    },
  });

  const dayAfterTomorrow = new Date(tomorrow);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

  await prisma.appointment.create({
    data: {
      barbershopId: barbershop.id,
      employeeId: barber2.id,
      clientId: client2.id,
      serviceId: service2.id,
      clientName: client2.name!,
      clientPhone: null,
      serviceName: service2.name,
      servicePriceCents: service2.priceCents,
      serviceDurationMinutes: service2.durationMinutes,
      serviceCurrency: service2.currency,
      startAt: dayAfterTomorrow,
      endAt: new Date(dayAfterTomorrow.getTime() + 45 * 60000),
      status: AppointmentStatus.PENDING,
    },
  });

  const nextWeek = new Date(tomorrow);
  nextWeek.setDate(nextWeek.getDate() + 7);

  await prisma.appointment.create({
    data: {
      barbershopId: barbershop.id,
      employeeId: barber1.id,
      clientId: client3.id,
      serviceId: service4.id,
      clientName: client3.name!,
      clientPhone: null,
      serviceName: service4.name,
      servicePriceCents: service4.priceCents,
      serviceDurationMinutes: service4.durationMinutes,
      serviceCurrency: service4.currency,
      startAt: nextWeek,
      endAt: new Date(nextWeek.getTime() + 60 * 60000),
      status: AppointmentStatus.PENDING,
    },
  });
  console.log('Created 3 appointments');

  // Create Photos
  await prisma.photo.create({
    data: {
      clientId: client1.id,
      url: 'https://res.cloudinary.com/barberapp/image/upload/v1/photos/style1.jpg',
      uploadedById: barber1User.id,
    },
  });

  await prisma.photo.create({
    data: {
      clientId: client1.id,
      url: 'https://res.cloudinary.com/barberapp/image/upload/v1/photos/style2.jpg',
      uploadedById: barber1User.id,
    },
  });
  console.log('Created photos');

  console.log('\n✅ Seed completed successfully!');
  console.log('\nSummary:');
  console.log(`  - 1 Owner: ${owner.email}`);
  console.log(`  - 1 Barbershop: ${barbershop.name}`);
  console.log(`  - 2 Barbers`);
  console.log(`  - 4 Services`);
  console.log(`  - 3 Clients`);
  console.log(`  - 3 Appointments`);
  console.log(`  - 2 Photos`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
