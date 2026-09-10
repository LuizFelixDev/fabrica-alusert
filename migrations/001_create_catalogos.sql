-- Migration: 001_create_catalogos.sql
-- Adiciona tabelas para o catálogo personalizado por cliente e relaciona com vendas.

-- 1. Tabela: catalogos
CREATE TABLE IF NOT EXISTS catalogos (
  id SERIAL PRIMARY KEY,
  id_cliente INT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  token_link VARCHAR(36) NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  data_criacao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabela: catalogo_itens
CREATE TABLE IF NOT EXISTS catalogo_itens (
  id SERIAL PRIMARY KEY,
  id_catalogo INT NOT NULL REFERENCES catalogos(id) ON DELETE CASCADE,
  id_produto INT NOT NULL REFERENCES produtos(id) ON DELETE RESTRICT,
  preco_negociado DECIMAL(10,2),
  visivel BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uk_catalogo_produto UNIQUE (id_catalogo, id_produto)
);

-- 3. Adicionar id_catalogo na tabela vendas
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS id_catalogo INT REFERENCES catalogos(id) ON DELETE SET NULL;
