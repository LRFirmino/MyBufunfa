import type {
  BackupCategory,
  BackupPayload,
  BackupSetting,
  BackupTransaction,
  CsvTransaction,
} from '@/types/backup';
import type { TransactionType } from '@/types/models';

export const BACKUP_SCHEMA_VERSION = 1;
export const BACKUP_APP_ID = 'mybufunfa';

/* -------------------------------------------------------------------------- */
/*                                    JSON                                    */
/* -------------------------------------------------------------------------- */

export function serializeBackup(payload: BackupPayload): string {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeCategory(value: unknown, index: number): BackupCategory {
  if (!isRecord(value)) {
    throw new Error(`A categoria ${index + 1} do backup é inválida.`);
  }
  const name = readString(value.name).trim();
  if (!name) {
    throw new Error(`A categoria ${index + 1} do backup está sem nome.`);
  }
  const limit = value.monthly_limit;
  const monthly_limit =
    typeof limit === 'number' && Number.isFinite(limit) && limit > 0 ? limit : null;
  const color = readString(value.color).trim();
  return {
    name,
    icon: readString(value.icon).trim() || 'pricetag-outline',
    color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#6B7280',
    monthly_limit,
  };
}

function normalizeTransaction(value: unknown, index: number): BackupTransaction {
  if (!isRecord(value)) {
    throw new Error(`O lançamento ${index + 1} do backup é inválido.`);
  }
  const amount = typeof value.amount === 'number' ? value.amount : Number(value.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`O lançamento ${index + 1} do backup tem um valor inválido.`);
  }
  const type: TransactionType | null =
    value.type === 'income' || value.type === 'expense' ? value.type : null;
  if (!type) {
    throw new Error(`O lançamento ${index + 1} do backup tem um tipo inválido.`);
  }
  const date = readString(value.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`O lançamento ${index + 1} do backup tem uma data inválida.`);
  }
  const categoryName = value.category_name;
  return {
    title: readString(value.title).trim() || 'Lançamento',
    amount,
    type,
    category_name:
      categoryName == null ? null : readString(categoryName).trim() || null,
    date,
    created_at: readString(value.created_at) || new Date().toISOString(),
  };
}

function normalizeSetting(value: unknown, index: number): BackupSetting {
  if (!isRecord(value)) {
    throw new Error(`A preferência ${index + 1} do backup é inválida.`);
  }
  const key = readString(value.key).trim();
  if (!key) {
    throw new Error(`A preferência ${index + 1} do backup está sem chave.`);
  }
  return { key, value: readString(value.value) };
}

/**
 * Valida e normaliza um backup JSON. Lança um erro amigável quando o arquivo
 * não é um backup reconhecido, para que a tela de Ajustes possa exibir a causa.
 */
export function parseBackup(text: string): BackupPayload {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('O arquivo selecionado não é um JSON válido.');
  }
  if (!isRecord(raw)) {
    throw new Error('O arquivo de backup não tem o formato esperado.');
  }

  const schemaVersion =
    typeof raw.schema_version === 'number' ? raw.schema_version : BACKUP_SCHEMA_VERSION;
  if (schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new Error(
      `Este backup usa a versão ${schemaVersion}, que não é compatível com esta versão do app.`,
    );
  }

  if (!Array.isArray(raw.categories) || !Array.isArray(raw.transactions)) {
    throw new Error('O backup precisa conter as listas de categorias e lançamentos.');
  }

  const categories = raw.categories.map(normalizeCategory);
  const seen = new Set<string>();
  for (const category of categories) {
    const key = category.name.toLocaleLowerCase('pt-BR');
    if (seen.has(key)) {
      throw new Error(`O backup tem a categoria "${category.name}" duplicada.`);
    }
    seen.add(key);
  }

  const transactions = raw.transactions.map(normalizeTransaction);
  const settings = Array.isArray(raw.settings)
    ? raw.settings.map(normalizeSetting)
    : [];

  return {
    app: readString(raw.app) || BACKUP_APP_ID,
    schema_version: BACKUP_SCHEMA_VERSION,
    exported_at: readString(raw.exported_at) || new Date().toISOString(),
    categories,
    transactions,
    settings,
  };
}

/* -------------------------------------------------------------------------- */
/*                                    CSV                                     */
/* -------------------------------------------------------------------------- */

function escapeCsv(value: string): string {
  if (/[";\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatCsvAmount(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

/**
 * Gera um CSV compatível com Excel em português: separador `;`, decimal com
 * vírgula e BOM UTF-8 para preservar acentos.
 */
export function buildTransactionsCsv(transactions: BackupTransaction[]): string {
  const header = ['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor', 'Criado em'];
  const lines = transactions.map((transaction) =>
    [
      transaction.date,
      transaction.title,
      transaction.category_name ?? '',
      transaction.type === 'income' ? 'Receita' : 'Despesa',
      formatCsvAmount(transaction.amount),
      transaction.created_at,
    ]
      .map((value) => escapeCsv(value))
      .join(';'),
  );
  return `\uFEFF${[header.join(';'), ...lines].join('\r\n')}\r\n`;
}

function detectDelimiter(text: string): ';' | ',' {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return semicolons >= commas ? ';' : ',';
}

function parseRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((line) => line.some((cell) => cell.trim() !== ''));
}

function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

function parseCsvDate(value: string): string | null {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const brazilian = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (brazilian) {
    return `${brazilian[3]}-${brazilian[2].padStart(2, '0')}-${brazilian[1].padStart(2, '0')}`;
  }
  return null;
}

export function parseCsvAmount(raw: string): number {
  let value = raw.replace(/[^\d.,-]/g, '').trim();
  if (!value) return 0;

  const hasComma = value.includes(',');
  const hasDot = value.includes('.');
  if (hasComma && hasDot) {
    // Formato brasileiro: 1.234,56
    value = value.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    value = value.replace(',', '.');
  } else if (hasDot) {
    const parts = value.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      // Formato 1.234 ou 1.234.567 (separador de milhar)
      value = parts.join('');
    }
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
}

function parseCsvType(raw: string): TransactionType | null {
  const value = normalizeHeader(raw);
  if (['receita', 'entrada', 'income', 'credito', 'credit'].includes(value)) {
    return 'income';
  }
  if (['despesa', 'saida', 'expense', 'debito', 'debit', 'gasto'].includes(value)) {
    return 'expense';
  }
  return null;
}

/**
 * Lê um CSV exportado pelo app (ou compatível). Linhas sem data/valor/tipo
 * válidos são ignoradas; se nenhuma linha sobrar, lança um erro.
 */
export function parseTransactionsCsv(text: string): CsvTransaction[] {
  const clean = text.replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(clean);
  const rows = parseRows(clean, delimiter);
  if (rows.length < 2) {
    throw new Error('O arquivo CSV está vazio ou não tem linhas de lançamentos.');
  }

  const headers = rows[0].map(normalizeHeader);
  const findColumn = (names: string[]) => headers.findIndex((header) => names.includes(header));

  const dateIndex = findColumn(['data', 'date']);
  const amountIndex = findColumn(['valor', 'amount', 'value']);
  const typeIndex = findColumn(['tipo', 'type']);
  const titleIndex = findColumn(['descricao', 'titulo', 'title', 'description']);
  const categoryIndex = findColumn(['categoria', 'category']);

  if (dateIndex < 0 || amountIndex < 0 || typeIndex < 0) {
    throw new Error('O CSV precisa ter as colunas Data, Valor e Tipo.');
  }

  const transactions: CsvTransaction[] = [];
  for (const row of rows.slice(1)) {
    const date = parseCsvDate(row[dateIndex] ?? '');
    const amount = parseCsvAmount(row[amountIndex] ?? '');
    const type = parseCsvType(row[typeIndex] ?? '');
    if (!date || amount <= 0 || !type) continue;

    const title = (row[titleIndex] ?? '').trim();
    const category = (row[categoryIndex] ?? '').trim();
    transactions.push({
      title: title || category || (type === 'income' ? 'Receita' : 'Despesa'),
      amount,
      type,
      category_name: category || null,
      date,
    });
  }

  if (transactions.length === 0) {
    throw new Error('Nenhum lançamento válido foi encontrado no CSV.');
  }
  return transactions;
}
