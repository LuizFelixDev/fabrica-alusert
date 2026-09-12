import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  listMateriasPrimas,
  getMateriaPrimaById,
  createMateriaPrima,
  updateMateriaPrima,
  deleteMateriaPrima,
} from '../controllers/materia-prima.js';

export const router = Router();

router.get('/', requireAuth, listMateriasPrimas);
router.get('/:id', requireAuth, getMateriaPrimaById);
router.post('/', requireAuth, createMateriaPrima);
router.put('/:id', requireAuth, updateMateriaPrima);
router.delete('/:id', requireAuth, deleteMateriaPrima);

