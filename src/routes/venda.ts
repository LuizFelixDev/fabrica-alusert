import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  listVendas,
  getVendaById,
  createVenda,
  updateVenda,
  updateVendaStatus,
  deleteVenda,
} from '../controllers/venda.js';

export const router = Router();

router.get('/', requireAuth, listVendas);
router.get('/:id', requireAuth, getVendaById);
router.post('/', requireAuth, createVenda);
router.put('/:id', requireAuth, updateVenda);
router.patch('/:id/status', requireAuth, updateVendaStatus);
router.delete('/:id', requireAuth, deleteVenda);

