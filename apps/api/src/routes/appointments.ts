/**
 * Appointment routes
 *
 * Role-based access:
 * - POST   /api/v1/appointments          CLIENT (book appointment)
 * - GET    /api/v1/appointments          OWNER, CLIENT
 * - GET    /api/v1/appointments/:id      ALL (tenant-scoped)
 * - PUT    /api/v1/appointments/:id      OWNER, BARBER (reschedule)
 * - PUT    /api/v1/appointments/:id/status  OWNER, BARBER (status transition)
 * - DELETE /api/v1/appointments/:id      CLIENT, OWNER (cancel)
 */
import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validateBody } from '../middleware/validate.js';
import {
  CreateAppointmentSchema,
  UpdateAppointmentSchema,
  AppointmentStatusSchema,
  AppointmentListQuerySchema,
  CancelAppointmentBodySchema,
} from '../schemas/appointment.js';
import * as appointmentService from '../services/appointmentService.js';
import { BadRequestError, ValidationError } from '../lib/errors.js';

/** Extracts route param with validation */
function paramId(req: Request): string {
  const id = req.params.id;
  if (!id) throw new BadRequestError('Appointment ID is required');
  return id;
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

const router = Router();

// All routes require authentication
router.use(requireAuth);

// ============================================
// POST /api/v1/appointments - Book appointment (CLIENT)
// ============================================
router.post(
  '/',
  requireRole('CLIENT'),
  validateBody(CreateAppointmentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const appointment = await appointmentService.createAppointment(
        req.body,
        req.userId
      );
      res.status(201).json({ success: true, data: appointment });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /api/v1/appointments - List appointments (OWNER, CLIENT)
// ============================================
router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const appointments = await appointmentService.listAppointments(
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
// GET /api/v1/appointments/:id - Get appointment (tenant-scoped)
// ============================================
router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const appointment = await appointmentService.getAppointment(
        paramId(req),
        req.userId,
        req.userRole
      );
      res.json({ success: true, data: appointment });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/:id/notifications',
  requireRole('OWNER', 'BARBER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const appointment = await appointmentService.getAppointment(
        paramId(req),
        req.userId,
        req.userRole
      );
      const notifications =
        await appointmentService.listAppointmentNotifications(
          appointment.id,
          appointment.barbershopId
        );
      res.json({ success: true, data: notifications });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// PUT /api/v1/appointments/:id - Update appointment (OWNER, BARBER)
// ============================================
router.put(
  '/:id',
  requireRole('OWNER', 'BARBER'),
  validateBody(UpdateAppointmentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const appointment = await appointmentService.updateAppointment(
        paramId(req),
        req.body,
        req.userId,
        req.userRole
      );
      res.json({ success: true, data: appointment });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// PUT /api/v1/appointments/:id/status - Transition status (OWNER, BARBER)
// ============================================
router.put(
  '/:id/status',
  requireRole('OWNER', 'BARBER'),
  validateBody(AppointmentStatusSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const appointment =
        await appointmentService.transitionAppointmentStatus(
          paramId(req),
          req.body.status,
          req.userId,
          req.userRole
        );
      res.json({ success: true, data: appointment });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// DELETE /api/v1/appointments/:id - Cancel appointment (CLIENT, OWNER)
// ============================================
router.delete(
  '/:id',
  requireRole('CLIENT', 'OWNER'),
  validateBody(CancelAppointmentBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reason = (req.body as { reason?: string | null } | undefined)?.reason;
      const appointment = await appointmentService.cancelAppointment(
        paramId(req),
        req.userId,
        req.userRole,
        { reason }
      );
      res.json({ success: true, data: appointment });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
