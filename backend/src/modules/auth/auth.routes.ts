import { Router } from 'express';
import { register, login, getProfile } from './auth.controller';
import { sendOtp, verifyOtp } from './authOtpController';
import { authenticateToken } from '../../middleware/auth.middleware';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.get('/profile', authenticateToken, getProfile);

export default router;