import { Router } from 'express';
import {
  listVendas,
  getVendaById,
  createVenda,
  updateVenda,
  updateVendaStatus,
  deleteVenda,
} from '../controllers/venda.js';

export const router = Router();

router.get('/', listVendas);
router.get('/:id', getVendaById);
router.post('/', createVenda);
router.put('/:id', updateVenda);
router.patch('/:id/status', updateVendaStatus);
router.delete('/:id', deleteVenda);
