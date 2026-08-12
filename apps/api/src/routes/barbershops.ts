/**
 * Barbershop routes
 *
 * Role-based access:
 * - GET  /api/v1/barbershops/:barbershopId/employees                       OWNER (list employees)
 * - POST /api/v1/barbershops/:barbershopId/employees                        OWNER (add employee)
 * - DELETE /api/v1/barbershops/:barbershopId/employees/:employeeId             OWNER (deactivate employee)
 * - PATCH  /api/v1/barbershops/:barbershopId/employees/:employeeId/reactivate     OWNER (reactivate employee)
 * - POST /api/v1/barbershops/:barbershopId/employees/:employeeId/services       OWNER (assign service)
 * - GET  /api/v1/barbershops/:barbershopId/employees/:employeeId/services       OWNER (list employee services)
 * - GET  /api/v1/barbershops/:barbershopId/me/services                         BARBER (list own assigned services)
 * - DELETE /api/v1/barbershops/:barbershopId/employees/:employeeId/services/:serviceId  OWNER (unassign service)
 * - GET  /api/v1/barbershops/:barbershopId/employees/:employeeId/appointments     OWNER, BARBER (list employee appointments)
 * - GET  /api/v1/barbershops/:barbershopId/working-hours                      OWNER (view working hours)
 * - PUT  /api/v1/barbershops/:barbershopId/working-hours                      OWNER (update working hours)
 * - GET  /api/v1/barbershops/:barbershopId/services                         OWNER (list services)
 * - POST /api/v1/barbershops/:barbershopId/services                         OWNER (create service)
 * - PATCH  /api/v1/barbershops/:barbershopId/services/:serviceId              OWNER (update service)
 * - DELETE /api/v1/barbershops/:barbershopId/services/:serviceId              OWNER (deactivate service)
 * - POST   /api/v1/barbershops/:barbershopId/service-records                   OWNER, BARBER (create walk-in record)
 * - GET    /api/v1/barbershops/:barbershopId/service-records                   OWNER (list barbershop records)
 * - GET    /api/v1/barbershops/:barbershopId/employees/:employeeId/service-records  OWNER, BARBER (list employee records)
 */
import { Router, Request, Response, NextFunction } from 'express';
import { readApiRuntimeConfig } from '../config/runtime.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { requireBarbershopAccess } from '../middleware/tenant.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validate.js';
import { CreateEmployeeSchema } from '../schemas/employee.js';
import { CreateEmployeeInvitationSchema } from '../schemas/employeeInvitation.js';
import { AssignServiceSchema } from '../schemas/employeeService.js';
import {
  UpdateEmployeeScheduleSchema,
  UpsertEmployeeScheduleExceptionSchema,
} from '../schemas/employeeSchedule.js';
import {
  AppointmentAvailabilityQuerySchema,
  DailyScheduleBoardQuerySchema,
  AppointmentListQuerySchema,
  CustomerLookupBodySchema,
  StaffCreateAppointmentSchema,
} from '../schemas/appointment.js';
import {
  PromotionCreateSchema,
  PromotionQuoteSchema,
  PromotionRedemptionListQuerySchema,
  PromotionUpdateSchema,
} from '../schemas/promotion.js';
import {
  LoyaltyAdminAdjustmentSchema,
  LoyaltyLedgerListQuerySchema,
  LoyaltyProgramUpdateSchema,
} from '../schemas/loyalty.js';
import {
  NotificationOperationsQuerySchema,
  NotificationRetryBodySchema,
} from '../schemas/notification.js';
import { CreateServiceSchema, UpdateServiceSchema } from '../schemas/service.js';
import * as employeeService from '../services/employeeService.js';
import * as employeeScheduleService from '../services/employeeScheduleService.js';
import * as employeeInvitationService from '../services/employeeInvitationService.js';
import * as serviceService from '../services/serviceService.js';
import * as appointmentService from '../services/appointmentService.js';
import * as appointmentNotificationService from '../services/appointmentNotificationService.js';
import * as workingHoursService from '../services/workingHoursService.js';
import * as serviceRecordService from '../services/serviceRecordService.js';
import { CreateServiceRecordSchema, ServiceRecordDateSchema, SummaryPeriodSchema } from '../schemas/serviceRecord.js';
import { UpdateWorkingHoursSchema } from '../schemas/workingHours.js';
import {
  ListCustomersQuerySchema,
  SearchCustomersBodySchema,
  UpdateCustomerBodySchema,
} from '../schemas/customer.js';
import * as customerService from '../services/customerService.js';
import * as scheduleBoardService from '../services/scheduleBoardService.js';
import * as promotionService from '../services/promotionService.js';
import * as loyaltyService from '../services/loyaltyService.js';
import { BadRequestError } from '../lib/errors.js';
import { ValidationError } from '../lib/errors.js';
import { normalizeEmail } from '../lib/email.js';
import { prisma } from '../lib/prisma.js';

/** Extracts barbershopId route param with validation */
function paramBarbershopId(req: Request): string {
  const id = req.params.barbershopId;
  if (!id) throw new BadRequestError('Barbershop ID is required');
  return id;
}

/** Extracts employeeId route param with validation */
function paramEmployeeId(req: Request): string {
  const id = req.params.employeeId;
  if (!id) throw new BadRequestError('Employee ID is required');
  return id;
}

function paramPromotionId(req: Request): string {
  const id = req.params.promotionId;
  if (!id) throw new BadRequestError('Promotion ID is required');
  return id;
}

function parseLoyaltyLedgerListQuery(req: Request) {
  const parsed = LoyaltyLedgerListQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new ValidationError(
      'Invalid loyalty ledger query parameters',
      parsed.error.flatten(),
    );
  }

  return parsed.data;
}

function parsePromotionRedemptionListQuery(req: Request) {
  const parsed = PromotionRedemptionListQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new ValidationError(
      'Invalid promotion redemption query parameters',
      parsed.error.flatten(),
    );
  }

  return parsed.data;
}

/** Extracts serviceId route param with validation */
function paramServiceId(req: Request): string {
  const id = req.params.serviceId;
  if (!id) throw new BadRequestError('Service ID is required');
  return id;
}

function paramNotificationId(req: Request): string {
  const id = req.params.notificationId;
  if (!id) throw new BadRequestError('Notification ID is required');
  return id;
}

function paramLocalDate(req: Request): string {
  const value = req.params.date;
  if (!value) {
    throw new BadRequestError('Date is required');
  }

  const parsed = ServiceRecordDateSchema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid date route parameter: Date must be in YYYY-MM-DD format (e.g. 2026-06-06)'
    );
  }

  return parsed.data;
}

function parseSummaryQuery(
  req: Request,
): { date?: string; period?: 'today' | 'week' | 'month' | 'year' } {
  const hasDate = typeof req.query.date === 'string';
  const hasPeriod = typeof req.query.period === 'string';

  if (hasDate && hasPeriod) {
    throw new BadRequestError('Date and period query parameters cannot be used together');
  }

  if (hasDate) {
    const parsed = ServiceRecordDateSchema.safeParse(req.query.date);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid date query parameter: Date must be in YYYY-MM-DD format (e.g. 2026-06-06)'
      );
    }
    return { date: parsed.data };
  }

  if (hasPeriod) {
    const parsed = SummaryPeriodSchema.safeParse(req.query.period);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid period query parameter: period must be one of today, week, month, year'
      );
    }
    return { period: parsed.data };
  }

  throw new BadRequestError('Either date or period query parameter is required');
}

function parseAvailabilityQuery(
  req: Request,
) {
  const parsed = AppointmentAvailabilityQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new ValidationError('Invalid availability query parameters', parsed.error.flatten());
  }

  return parsed.data;
}

function parseAppointmentListQuery(req: Request) {
  const parsed = AppointmentListQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new ValidationError(
      'Invalid appointment list query parameters',
      parsed.error.flatten()
    );
  }

  return parsed.data;
}

function parseDailyScheduleBoardQuery(req: Request) {
  const parsed = DailyScheduleBoardQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new ValidationError(
      'Invalid daily schedule board query parameters',
      parsed.error.flatten()
    );
  }

  return parsed.data;
}

function parseNotificationOperationsQuery(req: Request) {
  const parsed = NotificationOperationsQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new ValidationError(
      'Invalid notification operations query parameters',
      parsed.error.flatten()
    );
  }

  return parsed.data;
}

const router = Router();
const runtimeConfig = readApiRuntimeConfig(process.env);
const employeeInvitationCreateRateLimit = createRateLimiter(
  runtimeConfig.rateLimit,
  {
    code: 'EMPLOYEE_INVITATION_RATE_LIMITED',
    message: 'Too many employee invitation attempts, please try again later',
    max: Math.min(runtimeConfig.rateLimit.max, 5),
    keyGenerator: (req) =>
      `${req.userId}:${req.params.barbershopId ?? ''}:${normalizeEmail(
        typeof req.body?.email === 'string' ? req.body.email : ''
      )}`,
  }
);
const employeeInvitationResendRateLimit = createRateLimiter(
  runtimeConfig.rateLimit,
  {
    code: 'EMPLOYEE_INVITATION_RATE_LIMITED',
    message: 'Too many employee invitation resend attempts, please try again later',
    max: Math.min(runtimeConfig.rateLimit.max, 5),
    keyGenerator: (req) =>
      `${req.userId}:${req.params.barbershopId ?? ''}:${req.params.invitationId ?? ''}`,
  }
);

// All barbershop routes require authentication
router.use(requireAuth);

// ============================================
// GET /api/v1/barbershops/:barbershopId/employees
// List employees of a barbershop (OWNER only)
// ============================================
router.get(
  '/:barbershopId/employees',
  requireBarbershopAccess,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const employees = await employeeService.listEmployees(
        paramBarbershopId(req)
      );
      res.json({ success: true, data: employees });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// POST /api/v1/barbershops/:barbershopId/employees
// Add an existing user as employee (OWNER only)
// ============================================
router.post(
  '/:barbershopId/employees',
  requireBarbershopAccess,
  requireRole('OWNER'),
  validateBody(CreateEmployeeSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const employee = await employeeService.addEmployee(
        paramBarbershopId(req),
        req.body
      );
      res.status(201).json({ success: true, data: employee });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// POST /api/v1/barbershops/:barbershopId/employee-invitations
// Create employee immediately for local BARBER, otherwise create invitation (OWNER only)
// ============================================
router.post(
  '/:barbershopId/employee-invitations',
  requireBarbershopAccess,
  requireRole('OWNER'),
  employeeInvitationCreateRateLimit,
  validateBody(CreateEmployeeInvitationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await employeeInvitationService.createEmployeeInvitation(
        paramBarbershopId(req),
        req.userId,
        req.body
      );

      const statusCode =
        result.outcome === 'employee_created' || result.outcome === 'invitation_created'
          ? 201
          : 200;

      res.status(statusCode).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /api/v1/barbershops/:barbershopId/employee-invitations
// List local invitation lifecycle rows (OWNER only)
// ============================================
router.get(
  '/:barbershopId/employee-invitations',
  requireBarbershopAccess,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invitations = await employeeInvitationService.listEmployeeInvitations(
        paramBarbershopId(req)
      );
      res.json({ success: true, data: invitations });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// POST /api/v1/barbershops/:barbershopId/employee-invitations/:invitationId/resend
// Resend or retry an employee invitation (OWNER only)
// ============================================
router.post(
  '/:barbershopId/employee-invitations/:invitationId/resend',
  requireBarbershopAccess,
  requireRole('OWNER'),
  employeeInvitationResendRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invitation = await employeeInvitationService.resendEmployeeInvitation({
        barbershopId: paramBarbershopId(req),
        invitationId: req.params.invitationId ?? '',
        invitedByUserId: req.userId,
      });
      res.json({ success: true, data: invitation });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// DELETE /api/v1/barbershops/:barbershopId/employee-invitations/:invitationId
// Revoke an employee invitation (OWNER only)
// ============================================
router.delete(
  '/:barbershopId/employee-invitations/:invitationId',
  requireBarbershopAccess,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invitation = await employeeInvitationService.revokeEmployeeInvitation({
        barbershopId: paramBarbershopId(req),
        invitationId: req.params.invitationId ?? '',
      });
      res.json({ success: true, data: invitation });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// POST /api/v1/barbershops/:barbershopId/employees/:employeeId/services
// Assign a service to an employee (OWNER only)
// ============================================
router.post(
  '/:barbershopId/employees/:employeeId/services',
  requireBarbershopAccess,
  requireRole('OWNER'),
  validateBody(AssignServiceSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const link = await employeeService.assignService(
        paramBarbershopId(req),
        paramEmployeeId(req),
        req.body.serviceId
      );
      res.status(201).json({ success: true, data: link });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// DELETE /api/v1/barbershops/:barbershopId/employees/:employeeId/services/:serviceId
// Unassign a service from an employee (OWNER only)
// ============================================
router.delete(
  '/:barbershopId/employees/:employeeId/services/:serviceId',
  requireBarbershopAccess,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await employeeService.unassignService(
        paramBarbershopId(req),
        paramEmployeeId(req),
        paramServiceId(req)
      );
      res.json({ success: true, data: { message: 'Service unassigned' } });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /api/v1/barbershops/:barbershopId/employees/:employeeId/services
// List services assigned to an employee (OWNER only)
// ============================================
router.get(
  '/:barbershopId/employees/:employeeId/services',
  requireBarbershopAccess,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const services = await employeeService.listEmployeeServices(
        paramBarbershopId(req),
        paramEmployeeId(req)
      );
      res.json({ success: true, data: services });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /api/v1/barbershops/:barbershopId/me/services
// List assigned services for the authenticated barber's own employee record
// ============================================
router.get(
  '/:barbershopId/me/services',
  requireBarbershopAccess,
  requireRole('BARBER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const services = await employeeService.listOwnAssignedServices(
        paramBarbershopId(req),
        req.userId
      );
      res.json({ success: true, data: services });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// DELETE /api/v1/barbershops/:barbershopId/employees/:employeeId
// Deactivate an employee (OWNER only, soft-delete)
// ============================================
router.delete(
  '/:barbershopId/employees/:employeeId',
  requireBarbershopAccess,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await employeeService.deactivateEmployee(
        paramBarbershopId(req),
        paramEmployeeId(req)
      );
      res.json({ success: true, data: { message: 'Employee deactivated' } });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// POST /api/v1/barbershops/:barbershopId/appointments
// Create appointment as OWNER/BARBER (staff booking)
// ============================================
router.post(
  '/:barbershopId/appointments',
  requireBarbershopAccess,
  requireRole('OWNER', 'BARBER'),
  validateBody(StaffCreateAppointmentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const appointment = await appointmentService.createStaffAppointment(
        paramBarbershopId(req),
        req.body,
        req.userId,
        req.userRole,
        req.employeeId
      );
      res.status(201).json({ success: true, data: appointment });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/:barbershopId/promotions/quote',
  requireBarbershopAccess,
  requireRole('OWNER', 'BARBER'),
  validateBody(PromotionQuoteSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customerPhone = typeof req.body.clientPhone === 'string' ? req.body.clientPhone.trim() : '';
      const customerId = customerPhone
        ? await promotionService.findCustomerIdByPhone(paramBarbershopId(req), customerPhone)
        : null;
      const service = await prisma.service.findFirstOrThrow({
        where: {
          id: req.body.serviceId,
          barbershopId: paramBarbershopId(req),
          isActive: true,
          deletedAt: null,
        },
      });
      const evaluation = await promotionService.evaluatePromotion(prisma, {
        barbershopId: paramBarbershopId(req),
        code: req.body.code,
        serviceId: req.body.serviceId,
        servicePriceCents: service.priceCents,
        bookingChannel: 'STAFF',
        customerId,
        now: new Date(),
      });
      res.json({ success: true, data: evaluation });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:barbershopId/loyalty-program',
  requireBarbershopAccess,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const program = await loyaltyService.getLoyaltyProgram(paramBarbershopId(req));
      res.json({ success: true, data: program });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/:barbershopId/loyalty-program',
  requireBarbershopAccess,
  requireRole('OWNER'),
  validateBody(LoyaltyProgramUpdateSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const program = await loyaltyService.upsertLoyaltyProgram(
        paramBarbershopId(req),
        req.userId,
        req.body,
      );
      res.json({ success: true, data: program });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:barbershopId/customers/:customerId/loyalty',
  requireBarbershopAccess,
  requireRole('OWNER', 'BARBER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const summary = await loyaltyService.getCustomerLoyaltySummary({
        barbershopId: paramBarbershopId(req),
        customerId: req.params.customerId ?? '',
      });
      if (!summary) {
        throw new BadRequestError('Customer not found');
      }
      res.json({ success: true, data: summary });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:barbershopId/loyalty-ledger',
  requireBarbershopAccess,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = parseLoyaltyLedgerListQuery(req);
      const page = await loyaltyService.listLoyaltyLedger({
        barbershopId: paramBarbershopId(req),
        customerId: query.customerId,
        page: query.page,
        limit: query.limit,
      });
      res.json({ success: true, data: page });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/:barbershopId/customers/:customerId/loyalty-adjustments',
  requireBarbershopAccess,
  requireRole('OWNER'),
  validateBody(LoyaltyAdminAdjustmentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const summary = await loyaltyService.createLoyaltyAdminAdjustment({
        barbershopId: paramBarbershopId(req),
        customerId: req.params.customerId ?? '',
        userId: req.userId,
        actorRole: req.userRole,
        stampDelta: req.body.stampDelta,
        reason: req.body.reason,
      });
      res.json({ success: true, data: summary });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:barbershopId/promotions/summary',
  requireBarbershopAccess,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const summary = await promotionService.getPromotionSummary(paramBarbershopId(req));
      res.json({ success: true, data: summary });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:barbershopId/promotions',
  requireBarbershopAccess,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const promotions = await promotionService.listBarbershopPromotions(paramBarbershopId(req));
      res.json({ success: true, data: promotions });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/:barbershopId/promotions',
  requireBarbershopAccess,
  requireRole('OWNER'),
  validateBody(PromotionCreateSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const promotion = await promotionService.createPromotion(
        paramBarbershopId(req),
        req.userId,
        req.body,
      );
      res.status(201).json({ success: true, data: promotion });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:barbershopId/promotions/:promotionId',
  requireBarbershopAccess,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const promotion = await promotionService.getPromotionDetail(
        paramBarbershopId(req),
        paramPromotionId(req),
      );
      res.json({ success: true, data: promotion });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/:barbershopId/promotions/:promotionId',
  requireBarbershopAccess,
  requireRole('OWNER'),
  validateBody(PromotionUpdateSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const promotion = await promotionService.updatePromotion(
        paramBarbershopId(req),
        paramPromotionId(req),
        req.userId,
        req.body,
      );
      res.json({ success: true, data: promotion });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/:barbershopId/promotions/:promotionId/activate',
  requireBarbershopAccess,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const promotion = await promotionService.setPromotionActive(
        paramBarbershopId(req),
        paramPromotionId(req),
        req.userId,
        true,
      );
      res.json({ success: true, data: promotion });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/:barbershopId/promotions/:promotionId/deactivate',
  requireBarbershopAccess,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const promotion = await promotionService.setPromotionActive(
        paramBarbershopId(req),
        paramPromotionId(req),
        req.userId,
        false,
      );
      res.json({ success: true, data: promotion });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:barbershopId/promotions/:promotionId/redemptions',
  requireBarbershopAccess,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = await promotionService.listPromotionRedemptions(
        paramBarbershopId(req),
        paramPromotionId(req),
        parsePromotionRedemptionListQuery(req),
      );
      res.json({ success: true, data: page });
    } catch (error) {
      next(error);
    }
  },
);

// ============================================
// GET /api/v1/barbershops/:barbershopId/employees/:employeeId/appointments
// List appointments for an employee (OWNER, BARBER scoped)
// ============================================
router.get(
  '/:barbershopId/schedule/day',
  requireRole('OWNER', 'BARBER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schedule = await scheduleBoardService.getDailyScheduleBoard({
        barbershopId: paramBarbershopId(req),
        query: parseDailyScheduleBoardQuery(req),
        userId: req.userId,
        userRole: req.userRole,
        authenticatedEmployeeId: req.employeeId,
      });
      res.json({ success: true, data: schedule });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/:barbershopId/employees/:employeeId/appointments',
  requireBarbershopAccess,
  requireRole('OWNER', 'BARBER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const appointments = await appointmentService.listEmployeeAppointments(
        paramBarbershopId(req),
        paramEmployeeId(req),
        req.userId,
        req.userRole,
        parseAppointmentListQuery(req)
      );
      res.json({ success: true, data: appointments });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /api/v1/barbershops/:barbershopId/employees/:employeeId/appointments/availability
// Calculate employee availability for a local date + service
// ============================================
router.get(
  '/:barbershopId/employees/:employeeId/appointments/availability',
  requireBarbershopAccess,
  requireRole('OWNER', 'BARBER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const availability = await appointmentService.getAppointmentAvailability({
        barbershopId: paramBarbershopId(req),
        employeeId: paramEmployeeId(req),
        query: parseAvailabilityQuery(req),
        userId: req.userId,
        userRole: req.userRole,
        authenticatedEmployeeId: req.employeeId,
      });
      res.json({ success: true, data: availability });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /api/v1/barbershops/:barbershopId/employees/:employeeId/schedule
// Read one employee schedule (OWNER, BARBER self)
// ============================================
router.get(
  '/:barbershopId/employees/:employeeId/schedule',
  requireBarbershopAccess,
  requireRole('OWNER', 'BARBER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schedule = await employeeScheduleService.getEmployeeSchedule({
        barbershopId: paramBarbershopId(req),
        employeeId: paramEmployeeId(req),
        userId: req.userId,
        userRole: req.userRole,
        authenticatedEmployeeId: req.employeeId,
      });
      res.json({ success: true, data: schedule });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// PUT /api/v1/barbershops/:barbershopId/employees/:employeeId/schedule
// Update employee schedule mode + recurring custom hours (OWNER only)
// ============================================
router.put(
  '/:barbershopId/employees/:employeeId/schedule',
  requireBarbershopAccess,
  requireRole('OWNER'),
  validateBody(UpdateEmployeeScheduleSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schedule = await employeeScheduleService.updateEmployeeSchedule({
        barbershopId: paramBarbershopId(req),
        employeeId: paramEmployeeId(req),
        body: req.body,
        ownerUserId: req.userId,
      });
      res.json({ success: true, data: schedule });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// PUT /api/v1/barbershops/:barbershopId/employees/:employeeId/schedule/exceptions/:date
// Upsert one employee date exception (OWNER only)
// ============================================
router.put(
  '/:barbershopId/employees/:employeeId/schedule/exceptions/:date',
  requireBarbershopAccess,
  requireRole('OWNER'),
  validateBody(UpsertEmployeeScheduleExceptionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schedule = await employeeScheduleService.upsertEmployeeScheduleException({
        barbershopId: paramBarbershopId(req),
        employeeId: paramEmployeeId(req),
        localDate: paramLocalDate(req),
        body: req.body,
        ownerUserId: req.userId,
      });
      res.json({ success: true, data: schedule });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// DELETE /api/v1/barbershops/:barbershopId/employees/:employeeId/schedule/exceptions/:date
// Delete one employee date exception (OWNER only)
// ============================================
router.delete(
  '/:barbershopId/employees/:employeeId/schedule/exceptions/:date',
  requireBarbershopAccess,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schedule = await employeeScheduleService.deleteEmployeeScheduleException({
        barbershopId: paramBarbershopId(req),
        employeeId: paramEmployeeId(req),
        localDate: paramLocalDate(req),
        ownerUserId: req.userId,
      });
      res.json({ success: true, data: schedule });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /api/v1/barbershops/:barbershopId/notifications/summary
// OWNER-only notification operations summary
// ============================================
router.get(
  '/:barbershopId/notifications/summary',
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const summary =
        await appointmentNotificationService.getBarbershopNotificationOperationsSummary({
          barbershopId: paramBarbershopId(req),
          ownerUserId: req.userId,
        });
      res.json({ success: true, data: summary });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /api/v1/barbershops/:barbershopId/notifications
// OWNER-only paginated notification operations list
// ============================================
router.get(
  '/:barbershopId/notifications',
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = parseNotificationOperationsQuery(req);
      const notifications =
        await appointmentNotificationService.listBarbershopNotificationOperations({
          barbershopId: paramBarbershopId(req),
          ownerUserId: req.userId,
          status: query.status,
          type: query.type,
          channel: query.channel,
          dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
          dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
          page: query.page,
          limit: query.limit,
          sort: query.sort,
        });
      res.json({ success: true, data: notifications });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /api/v1/barbershops/:barbershopId/notifications/:notificationId
// OWNER-only notification detail + attempt history
// ============================================
router.get(
  '/:barbershopId/notifications/:notificationId',
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const detail =
        await appointmentNotificationService.getBarbershopNotificationOperationsDetail({
          barbershopId: paramBarbershopId(req),
          notificationId: paramNotificationId(req),
          ownerUserId: req.userId,
        });
      res.json({ success: true, data: detail });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// POST /api/v1/barbershops/:barbershopId/notifications/:notificationId/retry
// OWNER-only manual retry scheduling for FAILED notifications
// ============================================
router.post(
  '/:barbershopId/notifications/:notificationId/retry',
  requireRole('OWNER'),
  validateBody(NotificationRetryBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const notification =
        await appointmentNotificationService.retryFailedAppointmentNotification({
          barbershopId: paramBarbershopId(req),
          notificationId: paramNotificationId(req),
          ownerUserId: req.userId,
        });
      res.json({ success: true, data: notification });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// POST /api/v1/barbershops/:barbershopId/customers/lookup
// Repeat-customer insights (OWNER + BARBER scoped) used to surface
// no-show history before a new appointment is committed.
//
// Body-only by design: customer phone numbers are PII and must not
// appear in URLs, access logs, proxies, or referer headers. The
// response never includes the submitted phone (the caller already
// knows it; the server would be repeating PII for no reason).
//
// Tenant scoping is enforced inside the service so cross-tenant probes
// return 404 (existence hidden) instead of 403, matching the
// convention used by `getAppointment`.
// ============================================
router.post(
  '/:barbershopId/customers/lookup',
  requireRole('OWNER', 'BARBER'),
  validateBody(CustomerLookupBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as { phone: string; limit?: number };
      const insights = await appointmentService.lookupCustomerByPhone({
        barbershopId: paramBarbershopId(req),
        phone: body.phone,
        limit: body.limit ?? 10,
        userId: req.userId,
        userRole: req.userRole,
      });

      res.json({ success: true, data: insights });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /api/v1/barbershops/:barbershopId/customers
// List customers in the barbershop with optional search.
// Search is name-only here (no phone in URL). Phone search is
// exposed via POST /customers/search to keep PII out of access logs.
// ============================================
router.get(
  '/:barbershopId/customers',
  requireRole('OWNER', 'BARBER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = ListCustomersQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new ValidationError(
          'Invalid customer list query parameters',
          parsed.error.flatten()
        );
      }
      const { page, limit, sort } = parsed.data;
      const result = await customerService.listCustomers({
        barbershopId: paramBarbershopId(req),
        sort,
        limit,
        offset: (page - 1) * limit,
        user: { userId: req.userId, userRole: req.userRole },
      });
      res.json({
        success: true,
        data: {
          items: result.items,
          total: result.total,
          page,
          limit,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// POST /api/v1/barbershops/:barbershopId/customers/search
// Body-only search. The query may contain a phone number, which is
// PII and must not appear in URLs (proxies, referer headers, access
// logs). Mirrors the no-show lookup endpoint's PII discipline.
// ============================================
router.post(
  '/:barbershopId/customers/search',
  requireRole('OWNER', 'BARBER'),
  validateBody(SearchCustomersBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as {
        query: string;
        page: number;
        limit: number;
        sort: 'recent' | 'name' | 'no_shows';
      };
      const result = await customerService.listCustomers({
        barbershopId: paramBarbershopId(req),
        search: body.query,
        sort: body.sort,
        limit: body.limit,
        offset: (body.page - 1) * body.limit,
        user: { userId: req.userId, userRole: req.userRole },
      });
      res.json({
        success: true,
        data: {
          items: result.items,
          total: result.total,
          page: body.page,
          limit: body.limit,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /api/v1/barbershops/:barbershopId/customers/:customerId
// Full customer detail with counts, recent history, and upcoming
// appointments. Cross-tenant probes return 404.
// ============================================
router.get(
  '/:barbershopId/customers/:customerId',
  requireRole('OWNER', 'BARBER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const detail = await customerService.getCustomerDetail({
        barbershopId: paramBarbershopId(req),
        customerId: req.params.customerId ?? '',
        user: { userId: req.userId, userRole: req.userRole },
      });
      if (!detail) {
        // Hide existence on cross-tenant probes.
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Customer not found' },
        });
        return;
      }
      res.json({ success: true, data: detail });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// PATCH /api/v1/barbershops/:barbershopId/customers/:customerId
// Update mutable customer fields. Phone replacement is not supported
// (the phone is the identity key; changing it requires a merge
// policy that is out of scope for this milestone).
// ============================================
router.patch(
  '/:barbershopId/customers/:customerId',
  requireRole('OWNER', 'BARBER'),
  validateBody(UpdateCustomerBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as {
        name?: string | null;
        email?: string | null;
        internalNotes?: string | null;
      };
      const updated = await customerService.updateCustomer({
        barbershopId: paramBarbershopId(req),
        customerId: req.params.customerId ?? '',
        name: body.name,
        email: body.email,
        internalNotes: body.internalNotes,
        user: { userId: req.userId, userRole: req.userRole },
      });
      if (!updated) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Customer not found' },
        });
        return;
      }
      res.json({ success: true, data: updated });
    } catch (error) {
      // Surface the validation errors thrown by the service as 400
      // with the standard error envelope.
      if (error instanceof Error && /internalNotes exceeds/.test(error.message)) {
        next(
          new ValidationError(error.message, {
            internalNotes: ['too long'],
          })
        );
        return;
      }
      if (error instanceof Error && /name cannot be empty/.test(error.message)) {
        next(
          new ValidationError(error.message, {
            name: ['cannot be empty'],
          })
        );
        return;
      }
      next(error);
    }
  }
);

// ============================================
// PATCH /api/v1/barbershops/:barbershopId/employees/:employeeId/reactivate
// Reactivate a deactivated employee (OWNER only)
// ============================================
router.patch(
  '/:barbershopId/employees/:employeeId/reactivate',
  requireBarbershopAccess,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const employee = await employeeService.reactivateEmployee(
        paramBarbershopId(req),
        paramEmployeeId(req)
      );
      res.json({ success: true, data: employee });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /api/v1/barbershops/:barbershopId/working-hours
// List working hours for a barbershop (OWNER only)
// ============================================
router.get(
  '/:barbershopId/working-hours',
  requireBarbershopAccess,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const workingHours = await workingHoursService.getWorkingHours(
        paramBarbershopId(req),
        req.userId
      );
      res.json({ success: true, data: workingHours });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// PUT /api/v1/barbershops/:barbershopId/working-hours
// Update working hours for a barbershop (OWNER only)
// ============================================
router.put(
  '/:barbershopId/working-hours',
  requireBarbershopAccess,
  requireRole('OWNER'),
  validateBody(UpdateWorkingHoursSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const workingHours = await workingHoursService.updateWorkingHours(
        paramBarbershopId(req),
        req.userId,
        req.body.workingHours
      );
      res.json({ success: true, data: workingHours });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// POST /api/v1/barbershops/:barbershopId/services
// Create a service for a barbershop (OWNER only)
// ============================================
router.post(
  '/:barbershopId/services',
  requireBarbershopAccess,
  requireRole('OWNER'),
  validateBody(CreateServiceSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = await serviceService.createService(
        paramBarbershopId(req),
        req.body
      );
      res.status(201).json({ success: true, data: service });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /api/v1/barbershops/:barbershopId/services
// List services for a barbershop (OWNER only)
// ============================================
router.get(
  '/:barbershopId/services',
  requireBarbershopAccess,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      const services = await serviceService.listServices(
        paramBarbershopId(req),
        includeInactive
      );
      res.json({ success: true, data: services });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// PATCH /api/v1/barbershops/:barbershopId/services/:serviceId
// Update a service (OWNER only)
// ============================================
router.patch(
  '/:barbershopId/services/:serviceId',
  requireBarbershopAccess,
  requireRole('OWNER'),
  validateBody(UpdateServiceSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = await serviceService.updateService(
        paramBarbershopId(req),
        paramServiceId(req),
        req.body
      );
      res.json({ success: true, data: service });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// DELETE /api/v1/barbershops/:barbershopId/services/:serviceId
// Soft-deactivate a service (OWNER only)
// ============================================
router.delete(
  '/:barbershopId/services/:serviceId',
  requireBarbershopAccess,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await serviceService.deleteService(
        paramBarbershopId(req),
        paramServiceId(req)
      );
      res.json({ success: true, data: { message: 'Service deactivated' } });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// POST /api/v1/barbershops/:barbershopId/service-records
// Create a service record (OWNER, BARBER — BARBER self only)
// ============================================
router.post(
  '/:barbershopId/service-records',
  requireBarbershopAccess,
  requireRole('OWNER', 'BARBER'),
  validateBody(CreateServiceRecordSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const record = await serviceRecordService.createServiceRecord(
        paramBarbershopId(req),
        req.body,
        req.userId,
        req.userRole
      );
      res.status(201).json({ success: true, data: record });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /api/v1/barbershops/:barbershopId/service-records
// List service records for a barbershop (OWNER only)
// Supports optional query params: employeeId, date
// ============================================
router.get(
  '/:barbershopId/service-records',
  requireBarbershopAccess,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters: { employeeId?: string; date?: string } = {};
      if (typeof req.query.employeeId === 'string') filters.employeeId = req.query.employeeId;
      if (typeof req.query.date === 'string') {
        const parsed = ServiceRecordDateSchema.safeParse(req.query.date);
        if (!parsed.success) {
          throw new ValidationError(
            'Invalid date query parameter: Date must be in YYYY-MM-DD format (e.g. 2026-06-06)'
          );
        }
        filters.date = parsed.data;
      }

      const records = await serviceRecordService.listBarbershopRecords(
        paramBarbershopId(req),
        req.userId,
        filters
      );
      res.json({ success: true, data: records });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /api/v1/barbershops/:barbershopId/employees/:employeeId/service-records
// List service records for an employee (OWNER, BARBER self only)
// Supports optional query param: date
// ============================================
router.get(
  '/:barbershopId/employees/:employeeId/service-records',
  requireBarbershopAccess,
  requireRole('OWNER', 'BARBER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      let date: string | undefined;
      if (typeof req.query.date === 'string') {
        const parsed = ServiceRecordDateSchema.safeParse(req.query.date);
        if (!parsed.success) {
          throw new ValidationError(
            'Invalid date query parameter: Date must be in YYYY-MM-DD format (e.g. 2026-06-06)'
          );
        }
        date = parsed.data;
      }
      const records = await serviceRecordService.listEmployeeRecords(
        paramBarbershopId(req),
        paramEmployeeId(req),
        req.userId,
        req.userRole,
        date
      );
      res.json({ success: true, data: records });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /api/v1/barbershops/:barbershopId/employees/:employeeId/service-records/summary
// Daily summary for employee: total records, revenue, by-payment-method
// OWNER can view any employee; BARBER self only
// ============================================
router.get(
  '/:barbershopId/employees/:employeeId/service-records/summary',
  requireBarbershopAccess,
  requireRole('OWNER', 'BARBER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = parseSummaryQuery(req);

      const summary = await serviceRecordService.getDailyEmployeeServiceRecordSummary(
        paramBarbershopId(req),
        paramEmployeeId(req),
        req.userId,
        req.userRole,
        query
      );
      res.json({ success: true, data: summary });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /api/v1/barbershops/:barbershopId/service-records/summary
// Daily summary for OWNER: total records, revenue, by-employee, by-payment-method
// ============================================
router.get(
  '/:barbershopId/service-records/summary',
  requireBarbershopAccess,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = parseSummaryQuery(req);
      const employeeId = typeof req.query.employeeId === 'string'
        ? req.query.employeeId
        : undefined;

      const summary = await serviceRecordService.getDailyServiceRecordSummary(
        paramBarbershopId(req),
        req.userId,
        {
          ...query,
          employeeId,
        }
      );
      res.json({ success: true, data: summary });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
