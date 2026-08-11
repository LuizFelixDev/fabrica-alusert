import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database.js';

export const listClientes = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query('SELECT * FROM clientes ORDER BY id ASC');
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
};

export const getClienteById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM clientes WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
};

export const createCliente = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { nome, cpf_cnpj, telefone, email, rua, bairro, cidade, estado } = req.body;
    if (!nome || !cpf_cnpj || !rua || !bairro) {
      return res.status(400).json({ error: 'Campos nome, cpf_cnpj, rua e bairro são obrigatórios' });
    }

    const result = await pool.query(
      `INSERT INTO clientes (nome, cpf_cnpj, telefone, email, rua, bairro, cidade, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [nome, cpf_cnpj, telefone || null, email || null, rua, bairro, cidade || null, estado || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'CPF/CNPJ ou E-mail já cadastrado' });
    }
    next(error);
  }
};

export const updateCliente = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { nome, cpf_cnpj, telefone, email, rua, bairro, cidade, estado } = req.body;

    const check = await pool.query('SELECT * FROM clientes WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    const result = await pool.query(
      `UPDATE clientes
       SET nome = $1, cpf_cnpj = $2, telefone = $3, email = $4, rua = $5, bairro = $6, cidade = $7, estado = $8
       WHERE id = $9
       RETURNING *`,
      [
        nome !== undefined ? nome : check.rows[0].nome,
        cpf_cnpj !== undefined ? cpf_cnpj : check.rows[0].cpf_cnpj,
        telefone !== undefined ? telefone : check.rows[0].telefone,
        email !== undefined ? email : check.rows[0].email,
        rua !== undefined ? rua : check.rows[0].rua,
        bairro !== undefined ? bairro : check.rows[0].bairro,
        cidade !== undefined ? cidade : check.rows[0].cidade,
        estado !== undefined ? estado : check.rows[0].estado,
        id
      ]
    );
    res.json(result.rows[0]);
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'CPF/CNPJ ou E-mail já cadastrado' });
    }
    next(error);
  }
};

export const deleteCliente = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM clientes WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }
    res.json({ message: 'Cliente deletado com sucesso' });
  } catch (error) {
    next(error);
  }
};
