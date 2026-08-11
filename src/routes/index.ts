import { Router } from 'express';
import { router as usuarioRouter } from './usuario.js';
import { router as clienteRouter } from './cliente.js';
import { router as materiaPrimaRouter } from './materia-prima.js';
import { router as produtoRouter } from './produto.js';
import { router as vendaRouter } from './venda.js';

export const router = Router();

router.use('/usuarios', usuarioRouter);
router.use('/clientes', clienteRouter);
router.use('/materias-primas', materiaPrimaRouter);
router.use('/produtos', produtoRouter);
router.use('/vendas', vendaRouter);
