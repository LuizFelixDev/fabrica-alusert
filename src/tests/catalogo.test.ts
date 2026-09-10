import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../app.js';
import { pool } from '../config/database.js';

describe('Catálogos Personalizados por Cliente', () => {
  let clientId: number;
  let productId1: number;
  let productId2: number;
  let catalogId: number;
  let tokenLink: string;

  before(async () => {
    // Garantir que as tabelas de catalogo existam no DB
    await pool.query(`
      CREATE TABLE IF NOT EXISTS catalogos (
        id SERIAL PRIMARY KEY,
        id_cliente INT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
        token_link VARCHAR(36) NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        data_criacao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS catalogo_itens (
        id SERIAL PRIMARY KEY,
        id_catalogo INT NOT NULL REFERENCES catalogos(id) ON DELETE CASCADE,
        id_produto INT NOT NULL REFERENCES produtos(id) ON DELETE RESTRICT,
        preco_negociado DECIMAL(10,2),
        visivel BOOLEAN NOT NULL DEFAULT TRUE,
        CONSTRAINT uk_catalogo_produto UNIQUE (id_catalogo, id_produto)
      );

      ALTER TABLE vendas ADD COLUMN IF NOT EXISTS id_catalogo INT REFERENCES catalogos(id) ON DELETE SET NULL;
    `);

    // Criar cliente de teste
    const clientRes = await pool.query(
      `INSERT INTO clientes (nome, cpf_cnpj, telefone, email, rua, bairro)
       VALUES ('Cliente Teste Catalogo', '99.888.777/0001-99', '(81) 9999-0000', 'catalogo_test@gmail.com', 'Rua Teste', 'Bairro Teste')
       ON CONFLICT (cpf_cnpj) DO UPDATE SET nome = EXCLUDED.nome
       RETURNING id`
    );
    clientId = clientRes.rows[0].id;

    // Buscar 2 produtos de teste
    const prodRes = await pool.query(`SELECT id, preco_venda FROM produtos ORDER BY id ASC LIMIT 2`);
    if (prodRes.rows.length >= 2) {
      productId1 = prodRes.rows[0].id;
      productId2 = prodRes.rows[1].id;
    } else {
      // Criar produtos se não existirem
      const p1 = await pool.query(
        `INSERT INTO produtos (nome, preco_venda, preco_custo, quantidade_estoque)
         VALUES ('Produto Teste 1', 50.00, 25.00, 100) RETURNING id`
      );
      const p2 = await pool.query(
        `INSERT INTO produtos (nome, preco_venda, preco_custo, quantidade_estoque)
         VALUES ('Produto Teste 2', 100.00, 60.00, 50) RETURNING id`
      );
      productId1 = p1.rows[0].id;
      productId2 = p2.rows[0].id;
    }
  });

  after(async () => {
    // Limpeza dos dados criados nos testes
    if (clientId) {
      const sales = await pool.query('SELECT id FROM vendas WHERE id_cliente = $1', [clientId]);
      for (const sale of sales.rows) {
        await pool.query('DELETE FROM venda_itens WHERE id_venda = $1', [sale.id]);
        await pool.query('DELETE FROM vendas WHERE id = $1', [sale.id]);
      }
    }
    if (catalogId) {
      await pool.query('DELETE FROM catalogos WHERE id = $1', [catalogId]);
    }
    if (clientId) {
      await pool.query('DELETE FROM clientes WHERE id = $1', [clientId]);
    }
    await pool.end();
  });

  describe('CRUD Interno de Catálogos (Painel Empreendedor)', () => {
    it('deve criar um catálogo para um cliente', async () => {
      const res = await request(app)
        .post('/api/catalogos')
        .send({
          id_cliente: clientId,
          ativo: true,
          itens: [
            { id_produto: productId1, preco_negociado: 42.50, visivel: true },
            { id_produto: productId2, preco_negociado: null, visivel: true }
          ]
        });

      assert.strictEqual(res.status, 201);
      assert.ok(res.body.id);
      assert.strictEqual(res.body.id_cliente, clientId);
      assert.ok(res.body.token_link);
      assert.strictEqual(res.body.ativo, true);

      catalogId = res.body.id;
      tokenLink = res.body.token_link;
    });

    it('deve listar catálogos existentes', async () => {
      const res = await request(app).get('/api/catalogos');

      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body));
      const found = res.body.find((c: any) => c.id === catalogId);
      assert.ok(found);
      assert.strictEqual(found.nome_cliente, 'Cliente Teste Catalogo');
    });

    it('deve retornar detalhes do catálogo com comparação de preços lado a lado', async () => {
      const res = await request(app).get(`/api/catalogos/${catalogId}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.id, catalogId);
      assert.ok(Array.isArray(res.body.itens));

      const item1 = res.body.itens.find((i: any) => i.id_produto === productId1);
      assert.ok(item1);
      assert.strictEqual(item1.preco_negociado, 42.50);
      assert.strictEqual(item1.preco_efetivo, 42.50);

      const item2 = res.body.itens.find((i: any) => i.id_produto === productId2);
      assert.ok(item2);
      assert.strictEqual(item2.preco_negociado, null);
      assert.strictEqual(item2.preco_efetivo, item2.preco_padrao);
    });

    it('deve atualizar os itens e preços negociados do catálogo via PUT /catalogos/:id/itens', async () => {
      const res = await request(app)
        .put(`/api/catalogos/${catalogId}/itens`)
        .send({
          itens: [
            { id_produto: productId1, preco_negociado: 39.90, visivel: true },
            { id_produto: productId2, preco_negociado: 89.90, visivel: false }
          ]
        });

      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.itens));

      const item1 = res.body.itens.find((i: any) => i.id_produto === productId1);
      assert.strictEqual(item1.preco_negociado, 39.90);

      const item2 = res.body.itens.find((i: any) => i.id_produto === productId2);
      assert.strictEqual(item2.visivel, false);
    });
  });

  describe('Endpoints Públicos do Catálogo (Link Público)', () => {
    it('deve retornar catálogo público pelo token_link filtrando apenas produtos visíveis', async () => {
      const res = await request(app).get(`/catalogo/${tokenLink}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.token_link, tokenLink);
      assert.ok(Array.isArray(res.body.produtos));

      // Produto 1 deve estar visivel com preco 39.90
      const prod1 = res.body.produtos.find((p: any) => p.id_produto === productId1);
      assert.ok(prod1);
      assert.strictEqual(prod1.preco, 39.90);

      // Garantir que preco_custo NÃO é exposto
      assert.strictEqual(prod1.preco_custo, undefined);

      // Produto 2 está visivel=false, portanto NÃO deve ser retornado no GET público
      const prod2 = res.body.produtos.find((p: any) => p.id_produto === productId2);
      assert.strictEqual(prod2, undefined);
    });

    it('deve retornar 404 para token de catálogo inexistente', async () => {
      const res = await request(app).get('/catalogo/token-invalido-12345');
      assert.strictEqual(res.status, 404);
      assert.ok(res.body.error);
    });

    it('deve criar um pedido público resolvendo preços no backend e gravando snapshot', async () => {
      // Cliente envia pedido informando preco adulterado no body (ex: 1.00)
      const res = await request(app)
        .post(`/catalogo/${tokenLink}/pedido`)
        .send({
          itens: [
            { id_produto: productId1, quantidade: 2, preco_unitario: 1.00 } // Preço fraudulento deve ser ignorado!
          ],
          forma_pagamento: 'Pix'
        });

      assert.strictEqual(res.status, 201);
      assert.ok(res.body.id_pedido);
      assert.strictEqual(res.body.id_cliente, clientId);
      assert.strictEqual(res.body.id_catalogo, catalogId);

      // O valor unitario resolvido no backend deve ser 39.90 (39.90 * 2 = 79.80), NÃO 1.00
      assert.strictEqual(res.body.valor_total, 79.80);

      // Verificar snapshot gravado no banco de dados em venda_itens
      const saleId = res.body.id_pedido;
      const dbItems = await pool.query(
        'SELECT * FROM venda_itens WHERE id_venda = $1 AND id_produto = $2',
        [saleId, productId1]
      );
      assert.strictEqual(dbItems.rows.length, 1);
      assert.strictEqual(Number(dbItems.rows[0].preco_unitario), 39.90);
    });

    it('deve recusar pedido de produto não visível no catálogo', async () => {
      const res = await request(app)
        .post(`/catalogo/${tokenLink}/pedido`)
        .send({
          itens: [
            { id_produto: productId2, quantidade: 1 } // productId2 tem visivel=false
          ]
        });

      assert.strictEqual(res.status, 400);
      assert.ok(res.body.error);
      assert.match(res.body.error, /não está disponível neste catálogo/);
    });

    it('deve retornar 404 quando o catálogo é desativado (ativo = false)', async () => {
      // Desativar catálogo via endpoint interno
      await request(app)
        .put(`/api/catalogos/${catalogId}`)
        .send({ ativo: false });

      // Tentar GET público
      const getRes = await request(app).get(`/catalogo/${tokenLink}`);
      assert.strictEqual(getRes.status, 404);

      // Tentar POST público
      const postRes = await request(app)
        .post(`/catalogo/${tokenLink}/pedido`)
        .send({
          itens: [{ id_produto: productId1, quantidade: 1 }]
        });
      assert.strictEqual(postRes.status, 404);
    });
  });
});
