import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  listClientes,
  getClienteById,
  createCliente,
  updateCliente,
  deleteCliente,
} from '../controllers/cliente.js';
import { getOrCreateClienteCatalogo } from '../controllers/catalogo.js';

export const router = Router();

router.get('/', requireAuth, listClientes);
router.get('/:id', requireAuth, getClienteById);
router.post('/', requireAuth, createCliente);
router.post('/:id/catalogo', requireAuth, getOrCreateClienteCatalogo);
router.put('/:id', requireAuth, updateCliente);
router.delete('/:id', requireAuth, deleteCliente);

