import { Router } from 'express';
import { borrowItem, returnItem, getBorrowHistory } from './borrow.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

const router = Router();

router.post('/', authenticateToken, borrowItem);
router.post('/return', authenticateToken, returnItem);
router.get('/history', authenticateToken, getBorrowHistory);

export default router;