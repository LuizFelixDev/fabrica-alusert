-- Migration: Add 'pedido' to status_venda_enum
ALTER TYPE status_venda_enum ADD VALUE IF NOT EXISTS 'pedido';
