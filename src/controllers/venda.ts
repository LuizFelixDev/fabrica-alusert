import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database.js';

export const listVendas = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(`
      SELECT v.*, COALESCE(c.nome, 'Cliente Geral (Site Público)') as nome_cliente, COALESCE(u.nome, 'Catálogo Online') as nome_usuario
      FROM vendas v
      LEFT JOIN clientes c ON v.id_cliente = c.id
      LEFT JOIN usuarios u ON v.id_usuario = u.id
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
      SELECT v.*, COALESCE(c.nome, 'Cliente Geral (Site Público)') as nome_cliente, c.email as email_cliente, COALESCE(u.nome, 'Catálogo Online') as nome_usuario
      FROM vendas v
      LEFT JOIN clientes c ON v.id_cliente = c.id
      LEFT JOIN usuarios u ON v.id_usuario = u.id
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
    const { id_cliente, id_usuario, forma_pagamento, status, itens, data_vencimento_cheque, valor_pago } = req.body;

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

    const initialStatus = status || 'pendente';
    const initialValorPago = valor_pago !== undefined && valor_pago !== null ? Number(valor_pago) : 0;

    const saleRes = await client.query(
      `INSERT INTO vendas (id_cliente, id_usuario, forma_pagamento, status, valor_total, valor_pago, data_vencimento_cheque)
       VALUES ($1, $2, $3, $4, 0.00, $5, $6)
       RETURNING *`,
      [
        id_cliente, 
        id_usuario, 
        forma_pagamento, 
        initialStatus, 
        initialValorPago,
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

      if (initialStatus !== 'cancelada') {
        const stockQty = Number(product.quantidade_estoque || 0);
        const shortage = Math.max(0, quantidade - Math.max(0, stockQty));

        await client.query(
          `UPDATE produtos 
           SET quantidade_estoque = quantidade_estoque - $1,
               quantidade_a_fazer = COALESCE(quantidade_a_fazer, 0) + $2 
           WHERE id = $3`,
          [quantidade, shortage, id_produto]
        );
      }

      await client.query(
        `INSERT INTO venda_itens (id_venda, id_produto, quantidade, preco_unitario)
         VALUES ($1, $2, $3, $4)`,
        [sale.id, id_produto, quantidade, unitPrice]
      );

      total += Number(unitPrice) * quantidade;
    }

    let finalValorPago = initialValorPago;
    if (initialStatus === 'concluída' && (valor_pago === undefined || valor_pago === null)) {
      finalValorPago = total;
    }

    const updateSaleRes = await client.query(
      'UPDATE vendas SET valor_total = $1, valor_pago = $2 WHERE id = $3 RETURNING *',
      [total, finalValorPago, sale.id]
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

    const currentSaleRes = await client.query('SELECT * FROM vendas WHERE id = $1', [id]);
    if (currentSaleRes.rows.length === 0) {
      return res.status(404).json({ error: 'Venda não encontrada' });
    }
    const currentSale = currentSaleRes.rows[0];
    const currentStatus = currentSale.status;

    if (currentStatus === status) {
      await client.query('COMMIT');
      return res.json({ message: 'Venda já possui este status' });
    }

    const itemsRes = await client.query('SELECT id_produto, quantidade FROM venda_itens WHERE id_venda = $1', [id]);

    if ((currentStatus === 'pendente' || currentStatus === 'concluída' || currentStatus === 'pedido') && status === 'cancelada') {
      for (const item of itemsRes.rows) {
        await client.query(
          `UPDATE produtos 
           SET quantidade_estoque = quantidade_estoque + $1,
               quantidade_a_fazer = GREATEST(0, COALESCE(quantidade_a_fazer, 0) - $1)
           WHERE id = $2`,
          [item.quantidade, item.id_produto]
        );
      }
    }
    else if (currentStatus === 'cancelada' && (status === 'pendente' || status === 'concluída' || status === 'pedido')) {
      for (const item of itemsRes.rows) {
        await client.query(
          'UPDATE produtos SET quantidade_estoque = quantidade_estoque - $1 WHERE id = $2',
          [item.quantidade, item.id_produto]
        );
      }
    }

    let updatedValorPago = Number(currentSale.valor_pago || 0);
    if (status === 'concluída' && updatedValorPago < Number(currentSale.valor_total)) {
      updatedValorPago = Number(currentSale.valor_total);
    }

    const result = await client.query(
      'UPDATE vendas SET status = $1, valor_pago = $2 WHERE id = $3 RETURNING *',
      [status, updatedValorPago, id]
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

export const updatePagamentoVenda = async (req: Request, res: Response, next: NextFunction) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { valor_pago, status } = req.body;

    if (valor_pago === undefined || valor_pago === null || isNaN(Number(valor_pago))) {
      return res.status(400).json({ error: 'Campo valor_pago numérico é obrigatório' });
    }

    await client.query('BEGIN');

    const saleRes = await client.query('SELECT * FROM vendas WHERE id = $1', [id]);
    if (saleRes.rows.length === 0) {
      return res.status(404).json({ error: 'Venda não encontrada' });
    }
    const sale = saleRes.rows[0];
    const newValorPago = Math.max(0, Number(valor_pago));
    const totalVal = Number(sale.valor_total);

    let targetStatus = status || sale.status;
    if (!status && newValorPago >= totalVal && (sale.status === 'pendente' || sale.status === 'pedido')) {
      targetStatus = 'concluída';
    }

    const result = await client.query(
      'UPDATE vendas SET valor_pago = $1, status = $2 WHERE id = $3 RETURNING *',
      [newValorPago, targetStatus, id]
    );

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: error.message || 'Erro ao atualizar pagamento da venda' });
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
          `UPDATE produtos 
           SET quantidade_estoque = quantidade_estoque + $1,
               quantidade_a_fazer = GREATEST(0, COALESCE(quantidade_a_fazer, 0) - $1)
           WHERE id = $2`,
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

export const updateVenda = async (req: Request, res: Response, next: NextFunction) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { id_cliente, id_usuario, forma_pagamento, status, itens, data_vencimento_cheque, valor_pago } = req.body;

    if (!id_cliente || !id_usuario || !forma_pagamento || !Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ error: 'Campos id_cliente, id_usuario, forma_pagamento e itens são obrigatórios' });
    }

    await client.query('BEGIN');

    // Get current sale
    const currentSaleRes = await client.query('SELECT * FROM vendas WHERE id = $1', [id]);
    if (currentSaleRes.rows.length === 0) {
      return res.status(404).json({ error: 'Venda não encontrada' });
    }
    const currentSale = currentSaleRes.rows[0];

    // Revert stock for existing sale items (if previous status was not cancelada)
    if (currentSale.status !== 'cancelada') {
      const oldItemsRes = await client.query('SELECT id_produto, quantidade FROM venda_itens WHERE id_venda = $1', [id]);
      for (const oldItem of oldItemsRes.rows) {
        await client.query(
          `UPDATE produtos 
           SET quantidade_estoque = quantidade_estoque + $1,
               quantidade_a_fazer = GREATEST(0, COALESCE(quantidade_a_fazer, 0) - $1)
           WHERE id = $2`,
          [oldItem.quantidade, oldItem.id_produto]
        );
      }
    }

    // Delete old items
    await client.query('DELETE FROM venda_itens WHERE id_venda = $1', [id]);

    // Insert new items and deduct stock (if new status is not cancelada)
    let total = 0;
    const targetStatus = status || currentSale.status;

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

      if (targetStatus !== 'cancelada') {
        const stockQty = Number(product.quantidade_estoque || 0);
        const shortage = Math.max(0, quantidade - Math.max(0, stockQty));

        await client.query(
          `UPDATE produtos 
           SET quantidade_estoque = quantidade_estoque - $1,
               quantidade_a_fazer = COALESCE(quantidade_a_fazer, 0) + $2 
           WHERE id = $3`,
          [quantidade, shortage, id_produto]
        );
      }

      await client.query(
        `INSERT INTO venda_itens (id_venda, id_produto, quantidade, preco_unitario)
         VALUES ($1, $2, $3, $4)`,
        [id, id_produto, quantidade, unitPrice]
      );

      total += Number(unitPrice) * quantidade;
    }

    let finalValorPago = valor_pago !== undefined && valor_pago !== null 
      ? Number(valor_pago) 
      : (targetStatus === 'concluída' ? total : Number(currentSale.valor_pago || 0));

    // Update sale record
    const updateSaleRes = await client.query(
      `UPDATE vendas 
       SET id_cliente = $1, id_usuario = $2, forma_pagamento = $3, status = $4, valor_total = $5, valor_pago = $6, data_vencimento_cheque = $7
       WHERE id = $8 RETURNING *`,
      [
        id_cliente,
        id_usuario,
        forma_pagamento,
        targetStatus,
        total,
        finalValorPago,
        forma_pagamento === 'Cheque' ? (data_vencimento_cheque || null) : null,
        id
      ]
    );

    await client.query('COMMIT');

    const finalSale = updateSaleRes.rows[0];
    finalSale.itens = itens;
    res.json(finalSale);
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: error.message || 'Erro ao atualizar venda' });
  } finally {
    client.release();
  }
};
