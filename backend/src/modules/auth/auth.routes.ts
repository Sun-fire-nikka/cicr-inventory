import { Router } from 'express';
import {
  register,
  login,
  getProfile,
  listUsersForAdmin,
  approveUser,
  rejectUser,
  changeUserRole,
  deleteUser
} from './auth.controller';
import { sendOtp, verifyOtp } from './authOtpController';
import { authenticateToken, requireAdmin } from '../../middleware/auth.middleware';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.get('/profile', authenticateToken, getProfile);

// Admin user approval and member management routes
router.get('/admin/users', authenticateToken, requireAdmin, listUsersForAdmin);
router.post('/admin/users/:id/approve', authenticateToken, requireAdmin, approveUser);
router.post('/admin/users/:id/reject', authenticateToken, requireAdmin, rejectUser);
router.post('/admin/users/:id/role', authenticateToken, requireAdmin, changeUserRole);
router.delete('/admin/users/:id', authenticateToken, requireAdmin, deleteUser);

export default router;