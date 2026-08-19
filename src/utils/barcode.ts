import { Pool, PoolClient } from 'pg';

export const generateBarcode = async (
  client: Pool | PoolClient,
  nome: string,
  categoria: string,
  tamanho_numero: number | string | null | undefined,
  unidade_medida: string | null | undefined,
  overrideId?: number
): Promise<string> => {
  let idToUse = overrideId;
  if (!idToUse) {
    const seqRes = await client.query('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM produtos');
    idToUse = seqRes.rows[0].next_id;
  }
  const seqStr = String(idToUse).padStart(3, '0');

  let catPrefix = (categoria || 'PROD').trim().toUpperCase();
  if (catPrefix.startsWith('CUSC')) {
    catPrefix = 'CUSC';
  } else if (catPrefix.startsWith('CAFE') || catPrefix.startsWith('CAFEI')) {
    catPrefix = 'CAF';
  } else {
    catPrefix = catPrefix.substring(0, Math.min(4, catPrefix.length));
  }

  let sizeStr = '';
  if (tamanho_numero !== undefined && tamanho_numero !== null && tamanho_numero !== '') {
    const num = Number(tamanho_numero);
    if (!isNaN(num)) {
      if (num % 1 !== 0) {
        sizeStr = String(num).replace('.', '');
      } else {
        sizeStr = String(Math.floor(num));
      }
    }
  }

  if (unidade_medida && unidade_medida.trim().toUpperCase() === 'L') {
    sizeStr += 'L';
  }

  if (!sizeStr && nome) {
    const words = nome.trim().split(/\s+/);
    if (words.length > 1) {
      sizeStr = words[1].substring(0, 3).toUpperCase();
    }
  }

  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const year = String(today.getFullYear()).slice(-2);
  const dateStr = `${day}${month}${year}`;

  return `${catPrefix}${sizeStr}-${dateStr}-${seqStr}`;
};
