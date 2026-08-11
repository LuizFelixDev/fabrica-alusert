import { Router } from 'express';
import {
  listProdutos,
  getProdutoById,
  createProduto,
  updateProduto,
  deleteProduto,
} from '../controllers/produto.js';

export const router = Router();

router.get('/', listProdutos);
router.get('/:id', getProdutoById);
router.post('/', createProduto);
router.put('/:id', updateProduto);
router.delete('/:id', deleteProduto);
