import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const isSslRequired = process.env.DATABASE_URL?.includes('sslmode=require') || false;

export const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: isSslRequired ? { rejectUnauthorized: false } : false,
      }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_NAME || 'fabrica',
      }
);

// Test connection & auto-migrate columns
pool.connect(async (err, client, release) => {
  if (err) {
    console.error('Error acquiring client from pool:', err.stack);
  } else {
    console.log('Successfully connected to PostgreSQL database');
    try {
      if (client) {
        await client.query(`
          ALTER TABLE produtos ADD COLUMN IF NOT EXISTS quantidade_a_fazer INT DEFAULT 0;
          UPDATE produtos SET quantidade_a_fazer = 0 WHERE quantidade_estoque >= 0;

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
      }
    } catch (migErr) {
      console.error('Auto migration note:', migErr);
    } finally {
      if (release) release();
    }
  }
});
