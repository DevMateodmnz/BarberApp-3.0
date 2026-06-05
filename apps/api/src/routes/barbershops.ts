/**
 * Barbershop routes
 *
 * Role-based access:
 * - POST /api/v1/barbershops/:barbershopId/employees  OWNER (add employee)
 */
import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { requireBarbershopAccess } from '../middleware/tenant.js';
import { validateBody } from '../middleware/validate.js';
import { CreateEmployeeSchema } from '../schemas/employee.js';
import * as employeeService from '../services/employeeService.js';
import { BadRequestError } from '../lib/errors.js';

/** Extracts barbershopId route param with validation */
function paramBarbershopId(req: Request): string {
  const id = req.params.barbershopId;
  if (!id) throw new BadRequestError('Barbershop ID is required');
  return id;
}

const router = Router();

// All barbershop routes require authentication
router.use(requireAuth);

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

export default router;
