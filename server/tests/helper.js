import { pool } from '../src/db.js';

const TABEL_DATA = [
  'kunci_idempotensi',
  'pembatasan_laju',
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

/**
 * Membuka semua koneksi pool lebih dulu lalu mengembalikannya.
 *
 * WAJIB dipanggil sebelum uji perebutan. Tanpa ini, pool masih kosong saat uji
 * dimulai, sehingga waktu yang habis untuk MEMBUAT koneksi (puluhan milidetik,
 * satu per satu) jauh lebih besar daripada jendela race yang mau diuji —
 * permintaannya jadi berurutan, dan uji perebutan lolos bahkan untuk kode yang
 * benar-benar rusak.
 */
export async function panaskanPool() {
  const klien = await Promise.all(
    Array.from({ length: pool.options.max }, () => pool.connect())
  );
  for (const c of klien) c.release();
}
