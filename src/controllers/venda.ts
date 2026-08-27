import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database.js';

export const listVendas = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(`
      SELECT v.*, c.nome as nome_cliente, u.nome as nome_usuario
      FROM vendas v
      JOIN clientes c ON v.id_cliente = c.id
      JOIN usuarios u ON v.id_usuario = u.id
      ORDER BY v.id DESC
    `);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
};

export const getVendaById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const saleRes = await pool.query(`
      SELECT v.*, c.nome as nome_cliente, c.email as email_cliente, u.nome as nome_usuario
      FROM vendas v
      JOIN clientes c ON v.id_cliente = c.id
      JOIN usuarios u ON v.id_usuario = u.id
      WHERE v.id = $1
    `, [id]);

    if (saleRes.rows.length === 0) {
      return res.status(404).json({ error: 'Venda não encontrada' });
    }

    const sale = saleRes.rows[0];

    const itemsRes = await pool.query(`
      SELECT vi.*, p.nome as nome_produto, p.codigo_barras
      FROM venda_itens vi
      JOIN produtos p ON vi.id_produto = p.id
      WHERE vi.id_venda = $1
    `, [id]);

    sale.itens = itemsRes.rows;

    res.json(sale);
  } catch (error) {
    next(error);
  }
};

export const createVenda = async (req: Request, res: Response, next: NextFunction) => {
  const client = await pool.connect();
  try {
    const { id_cliente, id_usuario, forma_pagamento, status, itens, data_vencimento_cheque } = req.body;

    if (!id_cliente || !id_usuario || !forma_pagamento || !Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ error: 'Campos id_cliente, id_usuario, forma_pagamento e itens são obrigatórios' });
    }

    await client.query('BEGIN');

    // Verify client exists
    const clientCheck = await client.query('SELECT id FROM clientes WHERE id = $1', [id_cliente]);
    if (clientCheck.rows.length === 0) {
      throw new Error(`Cliente com ID ${id_cliente} não encontrado`);
    }

    // Verify user exists
    const userCheck = await client.query('SELECT id FROM usuarios WHERE id = $1', [id_usuario]);
    if (userCheck.rows.length === 0) {
      throw new Error(`Usuário com ID ${id_usuario} não encontrado`);
    }

    const saleRes = await client.query(
      `INSERT INTO vendas (id_cliente, id_usuario, forma_pagamento, status, valor_total, data_vencimento_cheque)
       VALUES ($1, $2, $3, $4, 0.00, $5)
       RETURNING *`,
      [
        id_cliente, 
        id_usuario, 
        forma_pagamento, 
        status || 'pendente', 
        forma_pagamento === 'Cheque' ? (data_vencimento_cheque || null) : null
      ]
    );
    const sale = saleRes.rows[0];

    let total = 0;

    for (const item of itens) {
      const { id_produto, quantidade, preco_unitario } = item;
      if (!id_produto || !quantidade || quantidade <= 0) {
        throw new Error('Cada item deve possuir id_produto e quantidade maior que 0');
      }

      const prodRes = await client.query('SELECT preco_venda, quantidade_estoque, nome FROM produtos WHERE id = $1', [id_produto]);
      if (prodRes.rows.length === 0) {
        throw new Error(`Produto com ID ${id_produto} não encontrado`);
      }

      const product = prodRes.rows[0];
      const unitPrice = preco_unitario !== undefined ? preco_unitario : product.preco_venda;

      if (unitPrice === null || unitPrice === undefined) {
        throw new Error(`Preço de venda não definido para o produto "${product.nome}"`);
      }

      if (status !== 'cancelada') {
        if (product.quantidade_estoque < quantidade) {
          throw new Error(`Estoque insuficiente para o produto "${product.nome}". Disponível: ${product.quantidade_estoque}, Solicitado: ${quantidade}`);
        }
        await client.query(
          'UPDATE produtos SET quantidade_estoque = quantidade_estoque - $1 WHERE id = $2',
          [quantidade, id_produto]
        );
      }

      await client.query(
        `INSERT INTO venda_itens (id_venda, id_produto, quantidade, preco_unitario)
         VALUES ($1, $2, $3, $4)`,
        [sale.id, id_produto, quantidade, unitPrice]
      );

      total += Number(unitPrice) * quantidade;
    }

    const updateSaleRes = await client.query(
      'UPDATE vendas SET valor_total = $1 WHERE id = $2 RETURNING *',
      [total, sale.id]
    );

    await client.query('COMMIT');

    const finalSale = updateSaleRes.rows[0];
    finalSale.itens = itens;
    res.status(201).json(finalSale);
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: error.message || 'Erro ao criar venda' });
  } finally {
    client.release();
  }
};

export const updateVendaStatus = async (req: Request, res: Response, next: NextFunction) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Campo status é obrigatório' });
    }

    await client.query('BEGIN');

    const currentSaleRes = await client.query('SELECT status FROM vendas WHERE id = $1', [id]);
    if (currentSaleRes.rows.length === 0) {
      return res.status(404).json({ error: 'Venda não encontrada' });
    }
    const currentStatus = currentSaleRes.rows[0].status;

    if (currentStatus === status) {
      await client.query('COMMIT');
      return res.json({ message: 'Venda já possui este status' });
    }

    const itemsRes = await client.query('SELECT id_produto, quantidade FROM venda_itens WHERE id_venda = $1', [id]);

    if ((currentStatus === 'pendente' || currentStatus === 'concluída') && status === 'cancelada') {
      for (const item of itemsRes.rows) {
        await client.query(
          'UPDATE produtos SET quantidade_estoque = quantidade_estoque + $1 WHERE id = $2',
          [item.quantidade, item.id_produto]
        );
      }
    }
    else if (currentStatus === 'cancelada' && (status === 'pendente' || status === 'concluída')) {
      for (const item of itemsRes.rows) {
        const prodRes = await client.query('SELECT quantidade_estoque, nome FROM produtos WHERE id = $1', [item.id_produto]);
        const product = prodRes.rows[0];
        if (product.quantidade_estoque < item.quantidade) {
          throw new Error(`Estoque insuficiente para reativar a venda. Produto "${product.nome}" necessita de ${item.quantidade}, mas possui ${product.quantidade_estoque}.`);
        }
        await client.query(
          'UPDATE produtos SET quantidade_estoque = quantidade_estoque - $1 WHERE id = $2',
          [item.quantidade, item.id_produto]
        );
      }
    }

    const result = await client.query(
      'UPDATE vendas SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: error.message || 'Erro ao atualizar status da venda' });
  } finally {
    client.release();
  }
};

export const deleteVenda = async (req: Request, res: Response, next: NextFunction) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    
    await client.query('BEGIN');

    const saleRes = await client.query('SELECT status FROM vendas WHERE id = $1', [id]);
    if (saleRes.rows.length === 0) {
      return res.status(404).json({ error: 'Venda não encontrada' });
    }
    const status = saleRes.rows[0].status;

    if (status !== 'cancelada') {
      const itemsRes = await client.query('SELECT id_produto, quantidade FROM venda_itens WHERE id_venda = $1', [id]);
      for (const item of itemsRes.rows) {
        await client.query(
          'UPDATE produtos SET quantidade_estoque = quantidade_estoque + $1 WHERE id = $2',
          [item.quantidade, item.id_produto]
        );
      }
    }

    await client.query('DELETE FROM vendas WHERE id = $1', [id]);
    await client.query('COMMIT');

    res.json({ message: 'Venda deletada com sucesso' });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};
