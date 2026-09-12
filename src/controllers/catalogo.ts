import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database.js';
import crypto from 'crypto';

// -----------------------------------------------------------------------------
// PUBLIC ENDPOINTS
// -----------------------------------------------------------------------------

/**
 * GET /catalogo/:token_link (Public)
 * Retorna o catálogo ativo e seus produtos visíveis com preços resolvidos.
 * NUNCA expõe preco_custo nem outros dados sensíveis.
 */
export const getCatalogoPublico = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let token_link = req.params.token_link;

    if (!token_link || token_link === 'demo' || token_link === 'latest' || token_link === 'default') {
      const latestRes = await pool.query(`SELECT token_link FROM catalogos WHERE ativo = TRUE ORDER BY id DESC LIMIT 1`);
      if (latestRes.rows.length > 0) {
        token_link = latestRes.rows[0].token_link;
      }
    }

    const catalogRes = await pool.query(
      `SELECT c.id, c.id_cliente, c.token_link, c.ativo, c.data_criacao,
              cl.nome AS nome_cliente, cl.email AS email_cliente, cl.telefone AS telefone_cliente
       FROM catalogos c
       JOIN clientes cl ON c.id_cliente = cl.id
       WHERE c.token_link = $1`,
      [token_link]
    );

    if (catalogRes.rows.length === 0 || !catalogRes.rows[0].ativo) {
      return res.status(404).json({ error: 'Catálogo não encontrado ou inativo' });
    }

    const catalog = catalogRes.rows[0];

    const itemsRes = await pool.query(
      `SELECT 
         p.id AS id_produto,
         p.codigo_barras,
         p.nome,
         p.descricao,
         p.categoria,
         p.tamanho_numero,
         p.unidade_medida,
         p.quantidade_estoque,
         p.peso_kg,
         COALESCE(ci.preco_negociado, p.preco_venda) AS preco,
         p.preco_venda AS preco_padrao,
         ci.preco_negociado
       FROM catalogo_itens ci
       JOIN produtos p ON ci.id_produto = p.id
       WHERE ci.id_catalogo = $1 AND ci.visivel = TRUE AND p.status = TRUE
       ORDER BY p.nome ASC`,
      [catalog.id]
    );

    res.json({
      id: catalog.id,
      id_cliente: catalog.id_cliente,
      nome_cliente: catalog.nome_cliente,
      email_cliente: catalog.email_cliente,
      telefone_cliente: catalog.telefone_cliente,
      token_link: catalog.token_link,
      ativo: catalog.ativo,
      data_criacao: catalog.data_criacao,
      produtos: itemsRes.rows.map(item => ({
        ...item,
        preco: Number(item.preco),
        preco_padrao: Number(item.preco_padrao),
        preco_negociado: item.preco_negociado !== null ? Number(item.preco_negociado) : null
      }))
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /catalogo/:token_link/pedido (Public)
 * Processa a criação de um pedido público vindo de um catálogo.
 * Valida visibilidade dos produtos no catálogo e resolve o preco_unitario no backend.
 */
export const createPedidoPublico = async (req: Request, res: Response, next: NextFunction) => {
  const client = await pool.connect();
  try {
    let token_link = req.params.token_link;
    const rawItens = req.body.itens || (Array.isArray(req.body) ? req.body : null);
    const formaPagamento = req.body.forma_pagamento || 'Pix';
    const idUsuario = req.body.id_usuario || null;

    if (!Array.isArray(rawItens) || rawItens.length === 0) {
      return res.status(400).json({ error: 'O pedido deve conter uma lista não vazia de itens.' });
    }

    if (!token_link || token_link === 'demo' || token_link === 'latest' || token_link === 'default') {
      const latestRes = await client.query(`SELECT token_link FROM catalogos WHERE ativo = TRUE ORDER BY id DESC LIMIT 1`);
      if (latestRes.rows.length > 0) {
        token_link = latestRes.rows[0].token_link;
      }
    }

    await client.query('BEGIN');

    // 1. Busca catálogo e valida se está ativo
    const catalogRes = await client.query(
      `SELECT id, id_cliente, ativo FROM catalogos WHERE token_link = $1`,
      [token_link]
    );

    if (catalogRes.rows.length === 0 || !catalogRes.rows[0].ativo) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Catálogo não encontrado ou inativo' });
    }

    const catalog = catalogRes.rows[0];

    // 2. Cria registro de venda inicial
    const saleRes = await client.query(
      `INSERT INTO vendas (id_cliente, id_usuario, id_catalogo, forma_pagamento, status, valor_total)
       VALUES ($1, $2, $3, $4, 'pendente', 0.00)
       RETURNING *`,
      [catalog.id_cliente, idUsuario, catalog.id, formaPagamento]
    );
    const sale = saleRes.rows[0];

    let total = 0;
    const createdItens = [];

    // 3. Processa e valida cada item do pedido
    for (const item of rawItens) {
      const { id_produto, quantidade } = item;
      if (!id_produto || !quantidade || quantidade <= 0) {
        throw new Error('Cada item deve possuir id_produto e quantidade maior que 0.');
      }

      // Valida se o produto pertence ao catálogo e está visível
      const itemCheckRes = await client.query(
        `SELECT ci.preco_negociado, ci.visivel, p.nome, p.preco_venda, p.quantidade_estoque, p.status
         FROM catalogo_itens ci
         JOIN produtos p ON ci.id_produto = p.id
         WHERE ci.id_catalogo = $1 AND ci.id_produto = $2`,
        [catalog.id, id_produto]
      );

      if (itemCheckRes.rows.length === 0 || !itemCheckRes.rows[0].visivel || !itemCheckRes.rows[0].status) {
        throw new Error(`Produto ID ${id_produto} não está disponível neste catálogo.`);
      }

      const dbItem = itemCheckRes.rows[0];
      
      // Resolve preço unitario (nunca confia no preço enviado pelo cliente)
      const unitPrice = dbItem.preco_negociado !== null && dbItem.preco_negociado !== undefined
        ? Number(dbItem.preco_negociado)
        : Number(dbItem.preco_venda);

      if (unitPrice === null || isNaN(unitPrice)) {
        throw new Error(`Preço não definido para o produto "${dbItem.nome}".`);
      }

      // Atualiza estoque e quantidade a fazer
      const stockQty = Number(dbItem.quantidade_estoque || 0);
      const shortage = Math.max(0, quantidade - Math.max(0, stockQty));

      await client.query(
        `UPDATE produtos 
         SET quantidade_estoque = quantidade_estoque - $1,
             quantidade_a_fazer = COALESCE(quantidade_a_fazer, 0) + $2 
         WHERE id = $3`,
        [quantidade, shortage, id_produto]
      );

      // Insere snapshot em venda_itens
      await client.query(
        `INSERT INTO venda_itens (id_venda, id_produto, quantidade, preco_unitario)
         VALUES ($1, $2, $3, $4)`,
        [sale.id, id_produto, quantidade, unitPrice]
      );

      total += unitPrice * quantidade;
      createdItens.push({
        id_produto,
        nome_produto: dbItem.nome,
        quantidade,
        preco_unitario: unitPrice,
        subtotal: unitPrice * quantidade
      });
    }

    // 4. Atualiza valor_total da venda
    const updatedSaleRes = await client.query(
      `UPDATE vendas SET valor_total = $1 WHERE id = $2 RETURNING *`,
      [total, sale.id]
    );

    await client.query('COMMIT');

    const finalSale = updatedSaleRes.rows[0];

    res.status(201).json({
      message: 'Pedido criado com sucesso',
      numero_pedido: `#${finalSale.id}`,
      id_pedido: finalSale.id,
      id_venda: finalSale.id,
      id_cliente: finalSale.id_cliente,
      id_catalogo: finalSale.id_catalogo,
      status: finalSale.status,
      forma_pagamento: finalSale.forma_pagamento,
      valor_total: Number(finalSale.valor_total),
      data_venda: finalSale.data_venda,
      itens: createdItens
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: error.message || 'Erro ao processar pedido do catálogo' });
  } finally {
    client.release();
  }
};

// -----------------------------------------------------------------------------
// INTERNAL AUTHENTICATED ENDPOINTS (Empreendedor)
// -----------------------------------------------------------------------------

/**
 * GET /api/catalogos (Internal)
 * Lista todos os catálogos cadastrados com nome do cliente e quantidade de itens.
 */
export const listCatalogos = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id_cliente } = req.query;

    let query = `
      SELECT c.*, cl.nome AS nome_cliente, cl.email AS email_cliente, cl.cpf_cnpj,
             (SELECT COUNT(*) FROM catalogo_itens ci WHERE ci.id_catalogo = c.id) AS total_itens
      FROM catalogos c
      JOIN clientes cl ON c.id_cliente = cl.id
    `;

    const params: any[] = [];
    if (id_cliente) {
      query += ` WHERE c.id_cliente = $1`;
      params.push(id_cliente);
    }

    query += ` ORDER BY c.id DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows.map(row => ({
      ...row,
      total_itens: Number(row.total_itens)
    })));
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/catalogos/:id (Internal)
 * Retorna todos os produtos com preço padrão e preço negociado lado a lado.
 */
export const getCatalogoById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const catalogRes = await pool.query(
      `SELECT c.*, cl.nome AS nome_cliente, cl.email AS email_cliente, cl.cpf_cnpj
       FROM catalogos c
       JOIN clientes cl ON c.id_cliente = cl.id
       WHERE c.id = $1`,
      [id]
    );

    if (catalogRes.rows.length === 0) {
      return res.status(404).json({ error: 'Catálogo não encontrado' });
    }

    const catalog = catalogRes.rows[0];

    const itemsRes = await pool.query(
      `SELECT 
         p.id AS id_produto,
         p.nome AS nome_produto,
         p.codigo_barras,
         p.categoria,
         p.unidade_medida,
         p.quantidade_estoque,
         p.preco_venda AS preco_padrao,
         ci.preco_negociado,
         COALESCE(ci.preco_negociado, p.preco_venda) AS preco_efetivo,
         COALESCE(ci.visivel, false) AS visivel,
         (ci.id IS NOT NULL) AS no_catalogo
       FROM produtos p
       LEFT JOIN catalogo_itens ci ON ci.id_produto = p.id AND ci.id_catalogo = $1
       ORDER BY p.nome ASC`,
      [id]
    );

    res.json({
      ...catalog,
      itens: itemsRes.rows.map(row => ({
        id_produto: row.id_produto,
        nome_produto: row.nome_produto,
        codigo_barras: row.codigo_barras,
        categoria: row.categoria,
        unidade_medida: row.unidade_medida,
        quantidade_estoque: row.quantidade_estoque,
        preco_padrao: Number(row.preco_padrao),
        preco_negociado: row.preco_negociado !== null ? Number(row.preco_negociado) : null,
        preco_efetivo: Number(row.preco_efetivo),
        visivel: Boolean(row.visivel),
        no_catalogo: Boolean(row.no_catalogo)
      }))
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/catalogos (Internal)
 * Cria um novo catálogo para um cliente.
 */
export const createCatalogo = async (req: Request, res: Response, next: NextFunction) => {
  const client = await pool.connect();
  try {
    const { id_cliente, ativo, itens } = req.body;

    if (!id_cliente) {
      return res.status(400).json({ error: 'Campo id_cliente é obrigatório.' });
    }

    const clientCheck = await client.query('SELECT id FROM clientes WHERE id = $1', [id_cliente]);
    if (clientCheck.rows.length === 0) {
      return res.status(404).json({ error: `Cliente com ID ${id_cliente} não encontrado.` });
    }

    await client.query('BEGIN');

    const tokenLink = crypto.randomUUID();
    const isActive = ativo !== undefined ? Boolean(ativo) : true;

    const catalogRes = await client.query(
      `INSERT INTO catalogos (id_cliente, token_link, ativo)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [id_cliente, tokenLink, isActive]
    );

    const catalog = catalogRes.rows[0];

    if (Array.isArray(itens) && itens.length > 0) {
      for (const item of itens) {
        const { id_produto, preco_negociado, visivel } = item;
        const isVisible = visivel !== undefined ? Boolean(visivel) : true;
        const price = preco_negociado !== undefined && preco_negociado !== null ? preco_negociado : null;

        await client.query(
          `INSERT INTO catalogo_itens (id_catalogo, id_produto, preco_negociado, visivel)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id_catalogo, id_produto)
           DO UPDATE SET preco_negociado = EXCLUDED.preco_negociado, visivel = EXCLUDED.visivel`,
          [catalog.id, id_produto, price, isVisible]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json(catalog);
  } catch (error: any) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};

/**
 * PUT /api/catalogos/:id (Internal)
 * Atualiza status ativo ou cliente do catálogo.
 */
export const updateCatalogo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { ativo, id_cliente } = req.body;

    const catalogCheck = await pool.query('SELECT * FROM catalogos WHERE id = $1', [id]);
    if (catalogCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Catálogo não encontrado' });
    }

    const current = catalogCheck.rows[0];
    const newAtivo = ativo !== undefined ? Boolean(ativo) : current.ativo;
    const newIdCliente = id_cliente !== undefined ? id_cliente : current.id_cliente;

    if (id_cliente !== undefined) {
      const clientCheck = await pool.query('SELECT id FROM clientes WHERE id = $1', [id_cliente]);
      if (clientCheck.rows.length === 0) {
        return res.status(404).json({ error: `Cliente com ID ${id_cliente} não encontrado.` });
      }
    }

    const result = await pool.query(
      `UPDATE catalogos SET ativo = $1, id_cliente = $2 WHERE id = $3 RETURNING *`,
      [newAtivo, newIdCliente, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/catalogos/:id (Internal)
 * Deleta um catálogo.
 */
export const deleteCatalogo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM catalogos WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Catálogo não encontrado' });
    }

    res.json({ message: 'Catálogo deletado com sucesso' });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/catalogos/:id/itens (Internal)
 * Adiciona, remove ou atualiza preços negociados e visibilidade dos produtos no catálogo.
 */
export const updateCatalogoItens = async (req: Request, res: Response, next: NextFunction) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const rawItens = req.body.itens || (Array.isArray(req.body) ? req.body : null);

    if (!Array.isArray(rawItens)) {
      return res.status(400).json({ error: 'Body deve conter um array "itens".' });
    }

    const catalogCheck = await client.query('SELECT id FROM catalogos WHERE id = $1', [id]);
    if (catalogCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Catálogo não encontrado' });
    }

    await client.query('BEGIN');

    for (const item of rawItens) {
      const { id_produto, preco_negociado, visivel, remover } = item;

      if (!id_produto) {
        throw new Error('Cada item deve conter id_produto.');
      }

      if (remover) {
        await client.query(
          `DELETE FROM catalogo_itens WHERE id_catalogo = $1 AND id_produto = $2`,
          [id, id_produto]
        );
      } else {
        const isVisible = visivel !== undefined ? Boolean(visivel) : true;
        const price = preco_negociado !== undefined && preco_negociado !== null ? preco_negociado : null;

        await client.query(
          `INSERT INTO catalogo_itens (id_catalogo, id_produto, preco_negociado, visivel)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id_catalogo, id_produto)
           DO UPDATE SET preco_negociado = EXCLUDED.preco_negociado, visivel = EXCLUDED.visivel`,
          [id, id_produto, price, isVisible]
        );
      }
    }

    await client.query('COMMIT');

    const updatedItems = await pool.query(
      `SELECT ci.*, p.nome AS nome_produto, p.preco_venda AS preco_padrao
       FROM catalogo_itens ci
       JOIN produtos p ON ci.id_produto = p.id
       WHERE ci.id_catalogo = $1
       ORDER BY p.nome ASC`,
      [id]
    );

    res.json({
      message: 'Itens do catálogo atualizados com sucesso',
      itens: updatedItems.rows.map(row => ({
        ...row,
        preco_padrao: Number(row.preco_padrao),
        preco_negociado: row.preco_negociado !== null ? Number(row.preco_negociado) : null
      }))
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: error.message || 'Erro ao atualizar itens do catálogo' });
  } finally {
    client.release();
  }
};

/**
 * POST /api/clientes/:id/catalogo
 * Busca ou cria o catálogo de um cliente.
 */
export const getOrCreateClienteCatalogo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const clientCheck = await pool.query('SELECT id, nome FROM clientes WHERE id = $1', [id]);
    if (clientCheck.rows.length === 0) {
      return res.status(404).json({ error: `Cliente com ID ${id} não encontrado.` });
    }

    const existingCat = await pool.query('SELECT * FROM catalogos WHERE id_cliente = $1 ORDER BY id DESC LIMIT 1', [id]);
    if (existingCat.rows.length > 0) {
      return res.json({
        ...existingCat.rows[0],
        nome: `Catálogo - ${clientCheck.rows[0].nome}`
      });
    }

    const tokenLink = crypto.randomUUID();
    const newCat = await pool.query(
      `INSERT INTO catalogos (id_cliente, token_link, ativo)
       VALUES ($1, $2, TRUE)
       RETURNING *`,
      [id, tokenLink]
    );

    res.status(201).json({
      ...newCat.rows[0],
      nome: `Catálogo - ${clientCheck.rows[0].nome}`
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/catalogos/:id/itens
 * Retorna os itens formatados como array CatalogoItem[] para o painel.
 */
export const getCatalogoItensArray = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const catalogCheck = await pool.query('SELECT id FROM catalogos WHERE id = $1', [id]);
    if (catalogCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Catálogo não encontrado' });
    }

    const result = await pool.query(
      `SELECT 
         p.id AS id_produto,
         p.nome AS nome_produto,
         p.preco_venda AS preco_venda,
         ci.preco_negociado,
         COALESCE(ci.visivel, true) AS visivel
       FROM produtos p
       LEFT JOIN catalogo_itens ci ON ci.id_produto = p.id AND ci.id_catalogo = $1
       WHERE p.status = TRUE
       ORDER BY p.nome ASC`,
      [id]
    );

    const items = result.rows.map(row => ({
      id_produto: row.id_produto,
      nome_produto: row.nome_produto,
      preco_venda: Number(row.preco_venda),
      preco_negociado: row.preco_negociado !== null ? Number(row.preco_negociado) : null,
      visivel: Boolean(row.visivel)
    }));

    res.json(items);
  } catch (error) {
    next(error);
  }
};

