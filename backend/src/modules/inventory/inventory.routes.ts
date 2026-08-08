import { Router } from 'express';
import {
  getItems,
  getItemById,
  getCategories,
  createItem,
  updateItem,
  deleteItem
} from './inventory.controller';
import { authenticateToken, requireAdmin } from '../../middleware/auth.middleware';

const router = Router();

// Public / Authenticated User Routes
router.get('/', getItems);
router.get('/categories', getCategories);
router.get('/:id', getItemById);

// Admin Only Routes
router.post('/', authenticateToken, requireAdmin, createItem);
router.patch('/:id', authenticateToken, requireAdmin, updateItem);
router.delete('/:id', authenticateToken, requireAdmin, deleteItem);

export default router;