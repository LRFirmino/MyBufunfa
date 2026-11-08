import { getDatabase } from '@/db';
import { seedDefaultCategories } from '@/db/schema';
import type {
  BackupCategory,
  BackupPayload,
  BackupSetting,
  BackupTransaction,
  CsvTransaction,
} from '@/types/backup';
import { BACKUP_APP_ID, BACKUP_SCHEMA_VERSION } from '@/utils/backup';

export interface ImportResult {
  categories: number;
  transactions: number;
  settings: number;
}

/** Lê categorias, lançamentos e preferências para montar o backup JSON. */
export async function exportBackup(): Promise<BackupPayload> {
  const db = await getDatabase();

  const [categories, transactions, settings] = await Promise.all([
    db.getAllAsync<BackupCategory>(
      `SELECT name, icon, color, monthly_limit
         FROM categories
        ORDER BY name COLLATE NOCASE ASC;`,
    ),
    db.getAllAsync<BackupTransaction>(
      `SELECT
         t.title,
         t.amount,
         t.type,
         c.name AS category_name,
         t.date,
         t.created_at
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
      ORDER BY t.date ASC, t.id ASC;`,
    ),
    db.getAllAsync<BackupSetting>('SELECT key, value FROM settings ORDER BY key ASC;'),
  ]);

  return {
    app: BACKUP_APP_ID,
    schema_version: BACKUP_SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    categories,
    transactions,
    settings,
  };
}

/**
 * Substitui todo o conteúdo do banco pelo backup. Os IDs não são preservados:
 * categorias são recriadas e os lançamentos são religados pelo nome.
 */
export async function importBackup(payload: BackupPayload): Promise<ImportResult> {
  const db = await getDatabase();
  let categories = 0;
  let transactions = 0;
  let settings = 0;

  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM transactions; DELETE FROM categories; DELETE FROM settings;');

    const categoryIds = new Map<string, number>();
    for (const category of payload.categories) {
      const result = await db.runAsync(
        'INSERT INTO categories (name, icon, color, monthly_limit) VALUES (?, ?, ?, ?);',
        category.name,
        category.icon,
        category.color,
        category.monthly_limit,
      );
      categoryIds.set(category.name.toLocaleLowerCase('pt-BR'), result.lastInsertRowId);
      categories += 1;
    }

    for (const transaction of payload.transactions) {
      const categoryId = transaction.category_name
        ? (categoryIds.get(transaction.category_name.toLocaleLowerCase('pt-BR')) ?? null)
        : null;
      await db.runAsync(
        `INSERT INTO transactions (title, amount, type, category_id, date, created_at)
         VALUES (?, ?, ?, ?, ?, ?);`,
        transaction.title,
        transaction.amount,
        transaction.type,
        categoryId,
        transaction.date,
        transaction.created_at,
      );
      transactions += 1;
    }

    for (const setting of payload.settings) {
      await db.runAsync(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
        setting.key,
        setting.value,
      );
      settings += 1;
    }
  });

  return { categories, transactions, settings };
}

/**
 * Apaga lançamentos e categorias e recria as categorias padrão.
 * As preferências (tema, etc.) são mantidas.
 */
export async function clearAllData(): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM transactions; DELETE FROM categories;');
    await seedDefaultCategories(db);
  });
}

/**
 * Importa lançamentos de um CSV. Substitui os lançamentos existentes, mantém as
 * categorias atuais e cria automaticamente categorias que ainda não existem.
 */
export async function importTransactionsCsv(
  rows: CsvTransaction[],
): Promise<{ transactions: number; categories: number }> {
  const db = await getDatabase();
  let createdCategories = 0;

  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM transactions;');

    const existing = await db.getAllAsync<{ id: number; name: string }>(
      'SELECT id, name FROM categories;',
    );
    const categoryIds = new Map(
      existing.map((category) => [category.name.toLocaleLowerCase('pt-BR'), category.id]),
    );

    for (const row of rows) {
      let categoryId: number | null = null;
      if (row.category_name) {
        const key = row.category_name.toLocaleLowerCase('pt-BR');
        categoryId = categoryIds.get(key) ?? null;
        if (categoryId == null) {
          const result = await db.runAsync(
            'INSERT INTO categories (name, icon, color, monthly_limit) VALUES (?, ?, ?, ?);',
            row.category_name,
            'pricetag-outline',
            '#6B7280',
            null,
          );
          categoryId = result.lastInsertRowId;
          categoryIds.set(key, categoryId);
          createdCategories += 1;
        }
      }

      await db.runAsync(
        `INSERT INTO transactions (title, amount, type, category_id, date)
         VALUES (?, ?, ?, ?, ?);`,
        row.title,
        row.amount,
        row.type,
        categoryId,
        row.date,
      );
    }
  });

  return { transactions: rows.length, categories: createdCategories };
}
