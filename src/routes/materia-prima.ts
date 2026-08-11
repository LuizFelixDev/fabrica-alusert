import { Router } from 'express';
import {
  listMateriasPrimas,
  getMateriaPrimaById,
  createMateriaPrima,
  updateMateriaPrima,
  deleteMateriaPrima,
} from '../controllers/materia-prima.js';

export const router = Router();

router.get('/', listMateriasPrimas);
router.get('/:id', getMateriaPrimaById);
router.post('/', createMateriaPrima);
router.put('/:id', updateMateriaPrima);
router.delete('/:id', deleteMateriaPrima);
