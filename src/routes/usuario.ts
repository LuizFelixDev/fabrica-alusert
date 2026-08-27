import { Router } from 'express';
import {
  listUsuarios,
  getUsuarioById,
  createUsuario,
  updateUsuario,
  deleteUsuario,
  loginUsuario,
} from '../controllers/usuario.js';

export const router = Router();

router.get('/', listUsuarios);
router.get('/:id', getUsuarioById);
router.post('/', createUsuario);
router.post('/login', loginUsuario);
router.put('/:id', updateUsuario);
router.delete('/:id', deleteUsuario);
