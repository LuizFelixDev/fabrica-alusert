import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database.js';
import bcrypt from 'bcryptjs';

export const listUsuarios = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query('SELECT id, nome, email, cadastro FROM usuarios ORDER BY id ASC');
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
};

export const getUsuarioById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT id, nome, email, cadastro FROM usuarios WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
};

export const createUsuario = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { nome, email, senha } = req.body;
    if (!nome || !email || !senha) {
      return res.status(400).json({ error: 'Campos nome, email e senha são obrigatórios' });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(senha, salt);

    const result = await pool.query(
      'INSERT INTO usuarios (nome, email, senha) VALUES ($1, $2, $3) RETURNING id, nome, email, cadastro',
      [nome, email, hashedPassword]
    );
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'E-mail já cadastrado' });
    }
    next(error);
  }
};

export const updateUsuario = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { nome, email, senha } = req.body;

    const userCheck = await pool.query('SELECT * FROM usuarios WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    let query = 'UPDATE usuarios SET nome = $1, email = $2';
    const params: any[] = [
      nome !== undefined ? nome : userCheck.rows[0].nome,
      email !== undefined ? email : userCheck.rows[0].email
    ];

    if (senha) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(senha, salt);
      query += ', senha = $3 WHERE id = $4';
      params.push(hashedPassword, id);
    } else {
      query += ' WHERE id = $3';
      params.push(id);
    }

    query += ' RETURNING id, nome, email, cadastro';

    const result = await pool.query(query, params);
    res.json(result.rows[0]);
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'E-mail já cadastrado' });
    }
    next(error);
  }
};

export const deleteUsuario = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM usuarios WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    res.json({ message: 'Usuário deletado com sucesso' });
  } catch (error) {
    next(error);
  }
};
