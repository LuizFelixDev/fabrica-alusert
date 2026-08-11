import pg from 'pg';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function run() {
  const isSslRequired = process.env.DATABASE_URL?.includes('sslmode=require') || false;

  const client = new Client(
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

  try {
    await client.connect();
    console.log("Connected to database.");

    const schemaSql = fs.readFileSync('schema.sql', 'utf-8');
    console.log('Running schema.sql...');
    await client.query(schemaSql);
    console.log('Schema imported successfully.');

    const seedSql = fs.readFileSync('seed.sql', 'utf-8');
    console.log('Running seed.sql...');
    await client.query(seedSql);
    console.log('Seed imported successfully.');
  } catch (err) {
    console.error('Error running migrations:', err);
  } finally {
    await client.end();
  }
}

run();
