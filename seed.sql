-- Seed Usuarios
-- Password for admin is 'admin123' (bcrypt hash)
INSERT INTO usuarios (nome, email, senha, cadastro) VALUES
('Administrador', 'admin@fabrica.com', '$2a$10$w857p4t4Xp5Uj2yK1Z0hG.zF.x2GjZc8qB1U9X7wE7G69fN3yW4eG', NOW());

-- Seed Materias Primas
INSERT INTO materias_primas (nome, descricao, unidade_medida, quantidade_estoque, valor_unitario, estoque_minimo) VALUES
('Disco de Alumínio 16cm', 'Chapa circular de alumínio para repuxo', 'kg', 500.00, 15.50, 100.00),
('Disco de Alumínio 18cm', 'Chapa circular de alumínio para repuxo', 'kg', 600.00, 17.20, 120.00),
('Disco de Alumínio 20cm', 'Chapa circular de alumínio para repuxo', 'kg', 450.00, 19.80, 100.00),
('Alça de Baquelite', 'Alça resistente ao calor para panelas', 'un', 1200.00, 1.20, 200.00),
('Pino de Baquelite para Tampa', 'Puxador de baquelite para tampa', 'un', 800.00, 0.80, 150.00),
('Parafuso Autoatarraxante', 'Parafuso para fixação da alça', 'un', 3000.00, 0.05, 500.00);

-- Seed Produtos (based on user request)
INSERT INTO produtos 
  (codigo_barras, nome, categoria, tamanho_numero, unidade_medida, quantidade_estoque, estoque_minimo, peso_kg, preco_custo, preco_venda, status, data_cadastro)
VALUES
  ('CUSC16-020826-001', 'Cuscuzeira 16', 'Cuscuzeira', 16.00, 'cm', 100, 20, 0.450, 12.50, 25.00, true, NOW()),
  ('CUSC18-020826-002', 'Cuscuzeira 18', 'Cuscuzeira', 18.00, 'cm', 150, 25, 0.520, 14.80, 29.90, true, NOW()),
  ('CUSC20-020826-003', 'Cuscuzeira 20', 'Cuscuzeira', 20.00, 'cm', 80, 15, 0.600, 18.20, 37.50, true, NOW()),
  ('CAF500-020826-004', 'Cafeteira 500ml', 'Cafeteira', 500.00, 'ml', 120, 30, 0.350, 9.50, 19.90, true, NOW()),
  ('CAF1L-020826-005', 'Cafeteira 1L', 'Cafeteira', 1.00, 'L', 90, 20, 0.480, 13.00, 26.50, true, NOW()),
  ('CAF13L-020826-006', 'Cafeteira 1.3L', 'Cafeteira', 1.30, 'L', 70, 15, 0.550, 15.50, 32.00, true, NOW()),
  ('CUSCEXP-020826-007', 'Cuscuzeira Expresso', 'Cuscuzeira', NULL, NULL, 50, 10, 0.400, 11.00, 22.90, true, NOW());

-- Seed Produto Materia Prima (Bill of Materials)
-- For Cuscuzeira 16: needs 1x Disco de Alumínio 16cm (assume 0.4kg), 2x Alça de Baquelite, 1x Pino de Tampa, 2x Parafusos
INSERT INTO produto_materia_prima (id_produto, id_materia_prima, quantidade_utilizada) VALUES
(1, 1, 0.40), -- 0.4kg of Disco 16cm
(1, 4, 2.00), -- 2 Alças
(1, 5, 1.00), -- 1 Pino
(1, 6, 2.00), -- 2 Parafusos

-- For Cuscuzeira 18: needs 1x Disco de Alumínio 18cm (0.48kg), 2x Alça de Baquelite, 1x Pino de Tampa, 2x Parafusos
(2, 2, 0.48),
(2, 4, 2.00),
(2, 5, 1.00),
(2, 6, 2.00);

-- Seed Clientes
INSERT INTO clientes (nome, cpf_cnpj, telefone, email, rua, bairro, cidade, estado) VALUES
('Luiz Silva', '123.456.789-00', '(81) 98888-8888', 'luiz@gmail.com', 'Rua Aurora, 123', 'Boa Vista', 'Recife', 'PE'),
('Metalúrgica Central Ltda', '12.345.678/0001-99', '(81) 3444-5555', 'contato@metalurgicacentral.com', 'Av. Caxangá, 2050', 'Cordeiro', 'Recife', 'PE');

-- Seed Vendas
INSERT INTO vendas (id_cliente, id_usuario, forma_pagamento, status, valor_total) VALUES
(1, 1, 'Pix', 'concluída', 87.40),
(2, 1, 'Cartão', 'pendente', 299.00);

-- Seed Venda Itens
INSERT INTO venda_itens (id_venda, id_produto, quantidade, preco_unitario) VALUES
(1, 1, 2, 25.00),  -- 2x Cuscuzeira 16 = 50.00
(1, 3, 1, 37.40),  -- 1x Cuscuzeira 20 = 37.40 (Total = 87.40)
(2, 2, 10, 29.90); -- 10x Cuscuzeira 18 = 299.00
