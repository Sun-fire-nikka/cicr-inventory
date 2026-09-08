import { Router } from 'express';
import {
  borrowItem,
  returnItem,
  getBorrowHistory,
  getAdmins,
  requestOtp,
  verifyOtp,
  createHardwareRequestHandler,
  getHardwareRequestsHandler,
  approveHardwareRequestHandler,
  rejectHardwareRequestHandler
} from './borrow.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

const router = Router();

router.get('/admins', getAdmins);
router.post('/', authenticateToken, borrowItem);
router.post('/request', authenticateToken, createHardwareRequestHandler);
router.get('/requests', authenticateToken, getHardwareRequestsHandler);
router.post('/requests/:id/approve', authenticateToken, approveHardwareRequestHandler);
router.post('/requests/:id/reject', authenticateToken, rejectHardwareRequestHandler);
router.post('/request-otp', authenticateToken, requestOtp);
router.post('/verify-otp', authenticateToken, verifyOtp);
router.post('/return', authenticateToken, returnItem);
router.get('/history', authenticateToken, getBorrowHistory);

export default router;

