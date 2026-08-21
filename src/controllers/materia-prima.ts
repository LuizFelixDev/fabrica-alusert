import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database.js';

export const listMateriasPrimas = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query('SELECT * FROM materias_primas ORDER BY id ASC');
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
};

export const getMateriaPrimaById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM materias_primas WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Matéria-prima não encontrada' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
};

export const createMateriaPrima = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { nome, descricao, unidade_medida, quantidade_estoque, valor_unitario, estoque_minimo, tipo_componente, diametro_mm, altura_mm, peso } = req.body;
    if (!nome || !unidade_medida) {
      return res.status(400).json({ error: 'Campos nome e unidade_medida são obrigatórios' });
    }

    const result = await pool.query(
      `INSERT INTO materias_primas (nome, descricao, unidade_medida, quantidade_estoque, valor_unitario, estoque_minimo, tipo_componente, diametro_mm, altura_mm, peso)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        nome,
        descricao || null,
        unidade_medida,
        quantidade_estoque !== undefined ? quantidade_estoque : 0.00,
        valor_unitario !== undefined ? valor_unitario : 0.00,
        estoque_minimo !== undefined ? estoque_minimo : 0.00,
        tipo_componente || null,
        diametro_mm !== undefined && diametro_mm !== '' ? diametro_mm : null,
        altura_mm !== undefined && altura_mm !== '' ? altura_mm : null,
        peso !== undefined && peso !== '' ? peso : null
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    if (error.code === '22P02') {
      return res.status(400).json({ error: 'Valor inválido para unidade_medida' });
    }
    next(error);
  }
};

export const updateMateriaPrima = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { nome, descricao, unidade_medida, quantidade_estoque, valor_unitario, estoque_minimo, tipo_componente, diametro_mm, altura_mm, peso } = req.body;

    const check = await pool.query('SELECT * FROM materias_primas WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Matéria-prima não encontrada' });
    }

    const result = await pool.query(
      `UPDATE materias_primas
       SET nome = $1, descricao = $2, unidade_medida = $3, quantidade_estoque = $4, valor_unitario = $5, estoque_minimo = $6,
           tipo_componente = $7, diametro_mm = $8, altura_mm = $9, peso = $10
       WHERE id = $11
       RETURNING *`,
      [
        nome !== undefined ? nome : check.rows[0].nome,
        descricao !== undefined ? descricao : check.rows[0].descricao,
        unidade_medida !== undefined ? unidade_medida : check.rows[0].unidade_medida,
        quantidade_estoque !== undefined ? quantidade_estoque : check.rows[0].quantidade_estoque,
        valor_unitario !== undefined ? valor_unitario : check.rows[0].valor_unitario,
        estoque_minimo !== undefined ? estoque_minimo : check.rows[0].estoque_minimo,
        tipo_componente !== undefined ? tipo_componente : check.rows[0].tipo_componente,
        diametro_mm !== undefined ? (diametro_mm !== '' ? diametro_mm : null) : check.rows[0].diametro_mm,
        altura_mm !== undefined ? (altura_mm !== '' ? altura_mm : null) : check.rows[0].altura_mm,
        peso !== undefined ? (peso !== '' ? peso : null) : check.rows[0].peso,
        id
      ]
    );
    res.json(result.rows[0]);
  } catch (error: any) {
    if (error.code === '22P02') {
      return res.status(400).json({ error: 'Valor inválido para unidade_medida' });
    }
    next(error);
  }
};

export const deleteMateriaPrima = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM materias_primas WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Matéria-prima não encontrada' });
    }
    res.json({ message: 'Matéria-prima deletada com sucesso' });
  } catch (error) {
    next(error);
  }
};
