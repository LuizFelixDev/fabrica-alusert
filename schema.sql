-- Drop tables if they exist (for clean migrations/recreations)
DROP TABLE IF EXISTS venda_itens CASCADE;
DROP TABLE IF EXISTS vendas CASCADE;
DROP TABLE IF EXISTS clientes CASCADE;
DROP TABLE IF EXISTS produto_materia_prima CASCADE;
DROP TABLE IF EXISTS produtos CASCADE;
DROP TABLE IF EXISTS materias_primas CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;

-- Drop enum types if they exist
DROP TYPE IF EXISTS status_venda_enum CASCADE;
DROP TYPE IF EXISTS forma_pagamento_enum CASCADE;
DROP TYPE IF EXISTS unidade_medida_enum CASCADE;

-- Create Enum Types
CREATE TYPE unidade_medida_enum AS ENUM (
  'kg',
  'm',
  'm²',
  'L',
  'un',
  'pç',
  'cx',
  'barra',
  'bobina',
  'rolo'
);

CREATE TYPE forma_pagamento_enum AS ENUM (
  'Pix',
  'Dinheiro',
  'Cartão',
  'Boleto'
);

CREATE TYPE status_venda_enum AS ENUM (
  'pendente',
  'concluída',
  'cancelada'
);

-- Table: usuarios
CREATE TABLE usuarios (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(80) NOT NULL,
  email VARCHAR(80) NOT NULL UNIQUE,
  senha VARCHAR(255) NOT NULL, -- Increased to 255 for hashed passwords (bcrypt)
  cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: materias_primas
CREATE TABLE materias_primas (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(80) NOT NULL,
  descricao TEXT,
  unidade_medida unidade_medida_enum NOT NULL,
  quantidade_estoque DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  valor_unitario DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  estoque_minimo DECIMAL(10,2) NOT NULL DEFAULT 0.00
);

-- Table: produtos
CREATE TABLE produtos (
  id SERIAL PRIMARY KEY,
  codigo_barras VARCHAR(30) UNIQUE,
  nome VARCHAR(100) NOT NULL,
  descricao TEXT,
  categoria VARCHAR(50),
  tamanho_numero DECIMAL(5,2),
  unidade_medida VARCHAR(10),
  quantidade_estoque INT NOT NULL DEFAULT 0,
  estoque_minimo INT NOT NULL DEFAULT 0,
  peso_kg DECIMAL(6,3),
  preco_custo DECIMAL(10,2),
  preco_venda DECIMAL(10,2),
  status BOOLEAN DEFAULT TRUE,
  data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: produto_materia_prima (Relation / Bill of Materials)
CREATE TABLE produto_materia_prima (
  id SERIAL PRIMARY KEY,
  id_produto INT REFERENCES produtos(id) ON DELETE CASCADE,
  id_materia_prima INT REFERENCES materias_primas(id) ON DELETE RESTRICT,
  quantidade_utilizada DECIMAL(10,2) NOT NULL
);

-- Table: clientes
CREATE TABLE clientes (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  cpf_cnpj VARCHAR(18) NOT NULL UNIQUE,
  telefone VARCHAR(20),
  email VARCHAR(100) UNIQUE,
  rua VARCHAR(100) NOT NULL,
  bairro VARCHAR(60) NOT NULL,
  cidade VARCHAR(60),
  estado CHAR(2),
  data_cadastro TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table: vendas
CREATE TABLE vendas (
  id SERIAL PRIMARY KEY,
  id_cliente INT REFERENCES clientes(id) ON DELETE RESTRICT,
  id_usuario INT REFERENCES usuarios(id) ON DELETE RESTRICT,
  data_venda TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  forma_pagamento forma_pagamento_enum NOT NULL,
  status status_venda_enum NOT NULL DEFAULT 'pendente',
  valor_total DECIMAL(10,2) NOT NULL DEFAULT 0.00
);

-- Table: venda_itens (Proposal: relates a sale to products)
CREATE TABLE venda_itens (
  id SERIAL PRIMARY KEY,
  id_venda INT REFERENCES vendas(id) ON DELETE CASCADE,
  id_produto INT REFERENCES produtos(id) ON DELETE RESTRICT,
  quantidade INT NOT NULL,
  preco_unitario DECIMAL(10,2) NOT NULL
);
