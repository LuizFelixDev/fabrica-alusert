-- Migration: Add 'vendedor' text column to vendas table
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS vendedor VARCHAR(100);
