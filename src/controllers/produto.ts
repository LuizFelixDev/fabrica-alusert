import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database.js';

export const listProdutos = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query('SELECT * FROM produtos ORDER BY id ASC');
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
};

export const getProdutoById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    // Fetch product details
    const productRes = await pool.query('SELECT * FROM produtos WHERE id = $1', [id]);
    if (productRes.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }
    const product = productRes.rows[0];

    // Fetch associated raw materials
    const materialsRes = await pool.query(
      `SELECT pmp.id as link_id, mp.id as id_materia_prima, mp.nome, mp.unidade_medida, pmp.quantidade_utilizada
       FROM produto_materia_prima pmp
       JOIN materias_primas mp ON pmp.id_materia_prima = mp.id
       WHERE pmp.id_produto = $1`,
      [id]
    );
    
    product.materias_primas = materialsRes.rows;

    res.json(product);
  } catch (error) {
    next(error);
  }
};

export const createProduto = async (req: Request, res: Response, next: NextFunction) => {
  const client = await pool.connect();
  try {
    const {
      codigo_barras, nome, descricao, categoria, tamanho_numero, unidade_medida,
      quantidade_estoque, estoque_minimo, peso_kg, preco_custo, preco_venda, status,
      materias_primas // Array of { id_materia_prima: number, quantidade_utilizada: number }
    } = req.body;

    if (!nome) {
      return res.status(400).json({ error: 'Campo nome é obrigatório' });
    }

    await client.query('BEGIN');

    // Insert product
    const productRes = await client.query(
      `INSERT INTO produtos (
        codigo_barras, nome, descricao, categoria, tamanho_numero, unidade_medida,
        quantidade_estoque, estoque_minimo, peso_kg, preco_custo, preco_venda, status, data_cadastro, data_atualizacao
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
       RETURNING *`,
      [
        codigo_barras || null,
        nome,
        descricao || null,
        categoria || null,
        tamanho_numero !== undefined ? tamanho_numero : null,
        unidade_medida || null,
        quantidade_estoque !== undefined ? quantidade_estoque : 0,
        estoque_minimo !== undefined ? estoque_minimo : 0,
        peso_kg !== undefined ? peso_kg : null,
        preco_custo !== undefined ? preco_custo : null,
        preco_venda !== undefined ? preco_venda : null,
        status !== undefined ? status : true
      ]
    );
    const newProduct = productRes.rows[0];

    // Insert associated raw materials if provided
    if (Array.isArray(materias_primas) && materias_primas.length > 0) {
      for (const mat of materias_primas) {
        if (!mat.id_materia_prima || mat.quantidade_utilizada === undefined) {
          throw new Error('Cada matéria-prima vinculada deve conter id_materia_prima e quantidade_utilizada');
        }
        await client.query(
          `INSERT INTO produto_materia_prima (id_produto, id_materia_prima, quantidade_utilizada)
           VALUES ($1, $2, $3)`,
          [newProduct.id, mat.id_materia_prima, mat.quantidade_utilizada]
        );
      }
    }

    await client.query('COMMIT');
    
    newProduct.materias_primas = materias_primas || [];
    res.status(201).json(newProduct);
  } catch (error: any) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Código de barras já cadastrado' });
    }
    next(error);
  } finally {
    client.release();
  }
};

export const updateProduto = async (req: Request, res: Response, next: NextFunction) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const {
      codigo_barras, nome, descricao, categoria, tamanho_numero, unidade_medida,
      quantidade_estoque, estoque_minimo, peso_kg, preco_custo, preco_venda, status,
      materias_primas // Array of { id_materia_prima: number, quantidade_utilizada: number }
    } = req.body;

    const check = await client.query('SELECT * FROM produtos WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }
    const current = check.rows[0];

    await client.query('BEGIN');

    // Update product
    const productRes = await client.query(
      `UPDATE produtos SET
        codigo_barras = $1, nome = $2, descricao = $3, categoria = $4, tamanho_numero = $5, unidade_medida = $6,
        quantidade_estoque = $7, estoque_minimo = $8, peso_kg = $9, preco_custo = $10, preco_venda = $11, status = $12,
        data_atualizacao = NOW()
       WHERE id = $13
       RETURNING *`,
      [
        codigo_barras !== undefined ? codigo_barras : current.codigo_barras,
        nome !== undefined ? nome : current.nome,
        descricao !== undefined ? descricao : current.descricao,
        categoria !== undefined ? categoria : current.categoria,
        tamanho_numero !== undefined ? tamanho_numero : current.tamanho_numero,
        unidade_medida !== undefined ? unidade_medida : current.unidade_medida,
        quantidade_estoque !== undefined ? quantidade_estoque : current.quantidade_estoque,
        estoque_minimo !== undefined ? estoque_minimo : current.estoque_minimo,
        peso_kg !== undefined ? peso_kg : current.peso_kg,
        preco_custo !== undefined ? preco_custo : current.preco_custo,
        preco_venda !== undefined ? preco_venda : current.preco_venda,
        status !== undefined ? status : current.status,
        id
      ]
    );
    const updatedProduct = productRes.rows[0];

    // Replace old links with new links if supplied
    if (materias_primas !== undefined) {
      await client.query('DELETE FROM produto_materia_prima WHERE id_produto = $1', [id]);

      if (Array.isArray(materias_primas) && materias_primas.length > 0) {
        for (const mat of materias_primas) {
          if (!mat.id_materia_prima || mat.quantidade_utilizada === undefined) {
            throw new Error('Cada matéria-prima vinculada deve conter id_materia_prima e quantidade_utilizada');
          }
          await client.query(
            `INSERT INTO produto_materia_prima (id_produto, id_materia_prima, quantidade_utilizada)
             VALUES ($1, $2, $3)`,
            [id, mat.id_materia_prima, mat.quantidade_utilizada]
          );
        }
      }
    }

    await client.query('COMMIT');
    
    const finalMaterials = await pool.query(
      `SELECT pmp.id as link_id, mp.id as id_materia_prima, mp.nome, mp.unidade_medida, pmp.quantidade_utilizada
       FROM produto_materia_prima pmp
       JOIN materias_primas mp ON pmp.id_materia_prima = mp.id
       WHERE pmp.id_produto = $1`,
      [id]
    );
    updatedProduct.materias_primas = finalMaterials.rows;

    res.json(updatedProduct);
  } catch (error: any) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Código de barras já cadastrado' });
    }
    next(error);
  } finally {
    client.release();
  }
};

export const deleteProduto = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM produtos WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }
    res.json({ message: 'Produto deletado com sucesso' });
  } catch (error) {
    next(error);
  }
};
