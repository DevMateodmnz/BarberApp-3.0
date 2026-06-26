import { Router, Request, Response, NextFunction } from 'express';
import { readApiRuntimeConfig } from '../config/runtime.js';
import { requireClerkSession } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import * as employeeInvitationService from '../services/employeeInvitationService.js';

const router = Router();
const runtimeConfig = readApiRuntimeConfig(process.env);
const reconcileRateLimit = createRateLimiter(runtimeConfig.rateLimit, {
  code: 'EMPLOYEE_INVITATION_RATE_LIMITED',
  message: 'Too many employee onboarding reconciliation attempts, please try again later',
  max: Math.min(runtimeConfig.rateLimit.max, 10),
  keyGenerator: (req) => req.clerkUserId ?? req.ip ?? 'anonymous',
});

router.post(
  '/employee-invitations/reconcile',
  requireClerkSession,
  reconcileRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await employeeInvitationService.reconcileEmployeeInvitation({
        clerkUserId: req.clerkUserId!,
      });

      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
