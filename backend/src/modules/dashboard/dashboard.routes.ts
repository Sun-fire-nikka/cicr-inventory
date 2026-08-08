import { Router } from 'express';
import { getDashboardStats, getAuditLogs } from './dashboard.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

const router = Router();

router.get('/stats', getDashboardStats);
router.get('/audit', authenticateToken, getAuditLogs);

export default router;