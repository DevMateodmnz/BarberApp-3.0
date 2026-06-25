/**
 * Me routes — authenticated user profile and context
 *
 * GET /api/v1/me/context — returns role + barbershop/employee context
 */
import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getUserContext } from '../services/meService.js';

const router = Router();

// All me routes require authentication
router.use(requireAuth);

// ============================================
// GET /api/v1/me/context
// Returns authenticated user's app context
// ============================================
router.get(
  '/context',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const context = await getUserContext(req.userId, req.userRole);
      res.json({ success: true, data: context });
    } catch (error) {
      next(error);
    }
  }
);

export default router;