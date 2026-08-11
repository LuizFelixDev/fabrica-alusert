import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'fabrica',
});

// Test connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error acquiring client from pool:', err.stack);
  } else {
    console.log('Successfully connected to PostgreSQL database:', process.env.DB_NAME || 'fabrica');
    release();
  }
});
