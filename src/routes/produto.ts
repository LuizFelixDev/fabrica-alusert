import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  listProdutos,
  getProdutoById,
  createProduto,
  updateProduto,
  deleteProduto,
} from '../controllers/produto.js';

export const router = Router();

router.get('/', requireAuth, listProdutos);
router.get('/:id', requireAuth, getProdutoById);
router.post('/', requireAuth, createProduto);
router.put('/:id', requireAuth, updateProduto);
router.delete('/:id', requireAuth, deleteProduto);

