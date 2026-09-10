import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  getCatalogoPublico,
  createPedidoPublico,
  listCatalogos,
  getCatalogoById,
  createCatalogo,
  updateCatalogo,
  deleteCatalogo,
  updateCatalogoItens,
} from '../controllers/catalogo.js';

// Roteador público (/catalogo)
export const publicCatalogoRouter = Router();

publicCatalogoRouter.get('/:token_link', getCatalogoPublico);
publicCatalogoRouter.post('/:token_link/pedido', createPedidoPublico);

// Roteador interno/autenticado (/catalogos)
export const internalCatalogoRouter = Router();

internalCatalogoRouter.get('/', requireAuth, listCatalogos);
internalCatalogoRouter.get('/:id', requireAuth, getCatalogoById);
internalCatalogoRouter.post('/', requireAuth, createCatalogo);
internalCatalogoRouter.put('/:id', requireAuth, updateCatalogo);
internalCatalogoRouter.delete('/:id', requireAuth, deleteCatalogo);
internalCatalogoRouter.put('/:id/itens', requireAuth, updateCatalogoItens);
