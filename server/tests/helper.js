import { pool } from '../src/db.js';

const TABEL_DATA = [
  'order_items',
  'orders',
  'credit_ledger',
  'topup_requests',
  'daily_menu_items',
  'service_days',
  'menu_items',
  'sessions',
  'users',
];

export async function resetDatabase() {
  const ada = [];
  for (const t of TABEL_DATA) {
    const { rows } = await pool.query('SELECT to_regclass($1) AS ada', [t]);
    if (rows[0].ada) ada.push(t);
  }
  if (ada.length === 0) return;
  await pool.query(`TRUNCATE ${ada.join(', ')} RESTART IDENTITY CASCADE`);
}
