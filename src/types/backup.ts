import type { TransactionType } from './models';

/** Categoria no formato usado pelo backup JSON (sem IDs, para facilitar a restauração). */
export interface BackupCategory {
  name: string;
  icon: string;
  color: string;
  monthly_limit: number | null;
}

/** Lançamento no formato usado pelo backup JSON. */
export interface BackupTransaction {
  title: string;
  amount: number;
  type: TransactionType;
  /** Nome da categoria; `null` quando o lançamento está sem categoria. */
  category_name: string | null;
  /** Data no formato `YYYY-MM-DD`. */
  date: string;
  created_at: string;
}

/** Preferência local exportada no backup. */
export interface BackupSetting {
  key: string;
  value: string;
}

/** Estrutura completa do arquivo de backup JSON. */
export interface BackupPayload {
  app: string;
  schema_version: number;
  exported_at: string;
  categories: BackupCategory[];
  transactions: BackupTransaction[];
  settings: BackupSetting[];
}

/** Linha de lançamento lida de um arquivo CSV. */
export interface CsvTransaction {
  title: string;
  amount: number;
  type: TransactionType;
  category_name: string | null;
  date: string;
}
