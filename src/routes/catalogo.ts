import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  getCatalogoPublico,
  createPedidoPublico,
  getCatalogoGeral,
  createPedidoGeral,
  listCatalogos,
  getCatalogoById,
  getCatalogoItensArray,
  createCatalogo,
  updateCatalogo,
  deleteCatalogo,
  updateCatalogoItens,
} from '../controllers/catalogo.js';

// Roteador público (/catalogo)
export const publicCatalogoRouter = Router();

publicCatalogoRouter.get('/', getCatalogoGeral);
publicCatalogoRouter.get('/geral', getCatalogoGeral);
publicCatalogoRouter.post('/geral/pedido', createPedidoGeral);
publicCatalogoRouter.post('/pedido', createPedidoGeral);
publicCatalogoRouter.get('/:token_link', getCatalogoPublico);
publicCatalogoRouter.post('/:token_link/pedido', createPedidoPublico);

// Roteador interno/autenticado (/catalogos)
export const internalCatalogoRouter = Router();

internalCatalogoRouter.get('/', requireAuth, listCatalogos);
internalCatalogoRouter.get('/:id', requireAuth, getCatalogoById);
internalCatalogoRouter.get('/:id/itens', requireAuth, getCatalogoItensArray);
internalCatalogoRouter.post('/', requireAuth, createCatalogo);
internalCatalogoRouter.put('/:id', requireAuth, updateCatalogo);
internalCatalogoRouter.patch('/:id', requireAuth, updateCatalogo);
internalCatalogoRouter.delete('/:id', requireAuth, deleteCatalogo);
internalCatalogoRouter.put('/:id/itens', requireAuth, updateCatalogoItens);

