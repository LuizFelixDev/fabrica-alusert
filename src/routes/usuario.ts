import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  listUsuarios,
  getUsuarioById,
  createUsuario,
  updateUsuario,
  deleteUsuario,
  loginUsuario,
} from '../controllers/usuario.js';

export const router = Router();

router.get('/', requireAuth, listUsuarios);
router.get('/:id', requireAuth, getUsuarioById);
router.post('/', requireAuth, createUsuario);
router.post('/login', loginUsuario); // Public login route
router.put('/:id', requireAuth, updateUsuario);
router.delete('/:id', requireAuth, deleteUsuario);

