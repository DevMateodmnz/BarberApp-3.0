/**
 * Barbershop routes
 *
 * Role-based access:
 * - GET  /api/v1/barbershops/:barbershopId/employees                       OWNER (list employees)
 * - POST /api/v1/barbershops/:barbershopId/employees                        OWNER (add employee)
 * - DELETE /api/v1/barbershops/:barbershopId/employees/:employeeId             OWNER (deactivate employee)
 * - POST /api/v1/barbershops/:barbershopId/employees/:employeeId/services       OWNER (assign service)
 * - DELETE /api/v1/barbershops/:barbershopId/employees/:employeeId/services/:serviceId  OWNER (unassign service)
 * - POST /api/v1/barbershops/:barbershopId/services                         OWNER (create service)
 */
import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { requireBarbershopAccess } from '../middleware/tenant.js';
import { validateBody } from '../middleware/validate.js';
import { CreateEmployeeSchema } from '../schemas/employee.js';
import { AssignServiceSchema } from '../schemas/employeeService.js';
import { CreateServiceSchema } from '../schemas/service.js';
import * as employeeService from '../services/employeeService.js';
import * as serviceService from '../services/serviceService.js';
import { BadRequestError } from '../lib/errors.js';

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

export default router;
