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
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { requireBarbershopAccess } from '../middleware/tenant.js';
import { validateBody } from '../middleware/validate.js';
import { CreateEmployeeSchema } from '../schemas/employee.js';
import { AssignServiceSchema } from '../schemas/employeeService.js';
import { CreateServiceSchema, UpdateServiceSchema } from '../schemas/service.js';
import * as employeeService from '../services/employeeService.js';
import * as serviceService from '../services/serviceService.js';
import * as appointmentService from '../services/appointmentService.js';
import * as workingHoursService from '../services/workingHoursService.js';
import * as serviceRecordService from '../services/serviceRecordService.js';
import { CreateServiceRecordSchema, ServiceRecordDateSchema } from '../schemas/serviceRecord.js';
import { UpdateWorkingHoursSchema } from '../schemas/workingHours.js';
import { BadRequestError } from '../lib/errors.js';
import { ValidationError } from '../lib/errors.js';

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

/** Extracts serviceId route param with validation */
function paramServiceId(req: Request): string {
  const id = req.params.serviceId;
  if (!id) throw new BadRequestError('Service ID is required');
  return id;
}

const router = Router();

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
        req.body.userId
      );
      res.status(201).json({ success: true, data: employee });
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
// GET /api/v1/barbershops/:barbershopId/employees/:employeeId/appointments
// List appointments for an employee (OWNER, BARBER scoped)
// ============================================
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
        req.userRole
      );
      res.json({ success: true, data: appointments });
    } catch (error) {
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
      if (typeof req.query.date !== 'string') {
        throw new BadRequestError('Date query parameter is required (YYYY-MM-DD)');
      }

      const parsed = ServiceRecordDateSchema.safeParse(req.query.date);
      if (!parsed.success) {
        throw new ValidationError(
          'Invalid date query parameter: Date must be in YYYY-MM-DD format (e.g. 2026-06-06)'
        );
      }

      const summary = await serviceRecordService.getDailyEmployeeServiceRecordSummary(
        paramBarbershopId(req),
        paramEmployeeId(req),
        req.userId,
        req.userRole,
        parsed.data
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
      if (typeof req.query.date !== 'string') {
        throw new BadRequestError('Date query parameter is required (YYYY-MM-DD)');
      }

      const parsed = ServiceRecordDateSchema.safeParse(req.query.date);
      if (!parsed.success) {
        throw new ValidationError(
          'Invalid date query parameter: Date must be in YYYY-MM-DD format (e.g. 2026-06-06)'
        );
      }

      const summary = await serviceRecordService.getDailyServiceRecordSummary(
        paramBarbershopId(req),
        req.userId,
        parsed.data
      );
      res.json({ success: true, data: summary });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
