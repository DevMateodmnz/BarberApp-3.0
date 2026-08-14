import { Router, type Request } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireBarbershopAccess } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { validateBody } from '../middleware/validate.js';
import { ValidationError } from '../lib/errors.js';
import {
  CommissionRangeQuerySchema,
  CreateLiquidationSchema,
  UpdateCommissionSettingsSchema,
  VoidLiquidationSchema,
} from '../schemas/commission.js';
import * as commissionService from '../services/commissionService.js';

const router = Router();
router.use(requireAuth);

function shopId(req: Request) {
  return req.params.barbershopId as string;
}

function parseRange(req: Request, requireEmployeeId: boolean) {
  const parsed = CommissionRangeQuerySchema.safeParse(req.query);
  if (!parsed.success || (requireEmployeeId && !parsed.data.employeeId)) {
    throw new ValidationError(
      'Invalid commission query parameters',
      parsed.success
        ? { fieldErrors: { employeeId: ['Employee ID is required'] } }
        : parsed.error.flatten()
    );
  }
  return parsed.data;
}

router.get('/:barbershopId/commissions/settings', requireBarbershopAccess, requireRole('OWNER'), async (req, res, next) => {
  try { res.json({ success: true, data: await commissionService.getCommissionSettings(shopId(req)) }); } catch (error) { next(error); }
});

router.put('/:barbershopId/commissions/settings', requireBarbershopAccess, requireRole('OWNER'), validateBody(UpdateCommissionSettingsSchema), async (req, res, next) => {
  try { res.json({ success: true, data: await commissionService.updateCommissionSettings(shopId(req), req.body) }); } catch (error) { next(error); }
});

router.get('/:barbershopId/commissions/overview', requireBarbershopAccess, requireRole('OWNER'), async (req, res, next) => {
  try {
    const query = parseRange(req, true);
    res.json({ success: true, data: await commissionService.getCommissionOverview(shopId(req), query.employeeId!, query) });
  } catch (error) { next(error); }
});

router.get('/:barbershopId/commissions/me', requireBarbershopAccess, requireRole('BARBER'), async (req, res, next) => {
  try {
    const query = parseRange(req, false);
    res.json({ success: true, data: await commissionService.getCommissionOverview(shopId(req), req.employeeId!, query) });
  } catch (error) { next(error); }
});

router.get('/:barbershopId/commissions/liquidations/preview', requireBarbershopAccess, requireRole('OWNER'), async (req, res, next) => {
  try {
    const query = parseRange(req, true);
    res.json({ success: true, data: await commissionService.previewLiquidation(shopId(req), query.employeeId!, query.dateFrom, query.dateTo) });
  } catch (error) { next(error); }
});

router.post('/:barbershopId/commissions/liquidations', requireBarbershopAccess, requireRole('OWNER'), validateBody(CreateLiquidationSchema), async (req, res, next) => {
  try {
    const data = await commissionService.createLiquidation(shopId(req), req.userId, req.body);
    res.status(201).json({ success: true, data });
  } catch (error) { next(error); }
});

router.get('/:barbershopId/commissions/liquidations', requireBarbershopAccess, requireRole('OWNER', 'BARBER'), async (req, res, next) => {
  try {
    const employeeId = req.userRole === 'BARBER'
      ? req.employeeId!
      : typeof req.query.employeeId === 'string' ? req.query.employeeId : '';
    if (!employeeId) throw new ValidationError('Employee ID is required');
    res.json({ success: true, data: await commissionService.listLiquidations(shopId(req), employeeId) });
  } catch (error) { next(error); }
});

router.get('/:barbershopId/commissions/liquidations/:liquidationId', requireBarbershopAccess, requireRole('OWNER', 'BARBER'), async (req, res, next) => {
  try {
    res.json({ success: true, data: await commissionService.getLiquidation(
      shopId(req),
      req.params.liquidationId as string,
      req.userRole === 'BARBER' ? req.employeeId : undefined
    ) });
  } catch (error) { next(error); }
});

router.post('/:barbershopId/commissions/liquidations/:liquidationId/pay', requireBarbershopAccess, requireRole('OWNER'), async (req, res, next) => {
  try { res.json({ success: true, data: await commissionService.markLiquidationPaid(shopId(req), req.params.liquidationId as string, req.userId) }); } catch (error) { next(error); }
});

router.post('/:barbershopId/commissions/liquidations/:liquidationId/void', requireBarbershopAccess, requireRole('OWNER'), validateBody(VoidLiquidationSchema), async (req, res, next) => {
  try { res.json({ success: true, data: await commissionService.voidLiquidation(shopId(req), req.params.liquidationId as string, req.userId, req.body.reason) }); } catch (error) { next(error); }
});

export default router;
