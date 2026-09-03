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
        `);
      }
    } catch (migErr) {
      console.error('Auto migration note:', migErr);
    } finally {
      if (release) release();
    }
  }
});
