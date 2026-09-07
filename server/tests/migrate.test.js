import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { jalankanMigrasi } from '../scripts/migrate.js';

after(async () => {
  await pool.end();
});

test('migrasi membuat tabel schema_migrations', async () => {
  await jalankanMigrasi();
  const { rows } = await pool.query(`SELECT to_regclass('schema_migrations') AS ada`);
  assert.ok(rows[0].ada, 'tabel schema_migrations seharusnya sudah ada');
});

test('migrasi bersifat idempoten', async () => {
  await jalankanMigrasi();
  const pertama = await pool.query('SELECT COUNT(*)::int AS n FROM schema_migrations');
  await jalankanMigrasi();
  const kedua = await pool.query('SELECT COUNT(*)::int AS n FROM schema_migrations');
  assert.equal(
    kedua.rows[0].n,
    pertama.rows[0].n,
    'menjalankan migrasi dua kali tidak boleh menambah catatan'
  );
});
