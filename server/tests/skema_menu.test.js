import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { resetDatabase } from './helper.js';

after(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDatabase();
});

async function siapkanMenuHarian(kuota = 10) {
  const menu = await pool.query(
    `INSERT INTO menu_items (nama, deskripsi, harga)
     VALUES ('Katsu Ayam Saus Rendang', 'Menu uji', 32000) RETURNING id`
  );
  await pool.query(
    `INSERT INTO service_days (tanggal, batas_waktu_pesan)
     VALUES (DATE '2026-10-01', TIMESTAMPTZ '2026-09-30 20:00:00+07')`
  );
  const harian = await pool.query(
    `INSERT INTO daily_menu_items (tanggal, menu_item_id, harga, kuota)
     VALUES (DATE '2026-10-01', $1, 32000, $2) RETURNING id`,
    [menu.rows[0].id, kuota]
  );
  return { menuId: menu.rows[0].id, harianId: harian.rows[0].id };
}

test('menu harian bisa dibuat dengan terjual nol', async () => {
  const { harianId } = await siapkanMenuHarian();
  const { rows } = await pool.query(
    'SELECT terjual, kuota FROM daily_menu_items WHERE id = $1',
    [harianId]
  );
  assert.equal(rows[0].terjual, 0);
  assert.equal(rows[0].kuota, 10);
});

test('terjual tidak boleh melebihi kuota', async () => {
  const { harianId } = await siapkanMenuHarian(10);
  await assert.rejects(
    () => pool.query('UPDATE daily_menu_items SET terjual = 11 WHERE id = $1', [harianId]),
    (err) => err.code === '23514',
    'over-jual seharusnya ditolak database'
  );
});

test('terjual boleh tepat sama dengan kuota', async () => {
  const { harianId } = await siapkanMenuHarian(10);
  await pool.query('UPDATE daily_menu_items SET terjual = 10 WHERE id = $1', [harianId]);
  const { rows } = await pool.query('SELECT terjual FROM daily_menu_items WHERE id = $1', [
    harianId,
  ]);
  assert.equal(rows[0].terjual, 10);
});

test('satu menu tidak boleh didaftarkan dua kali di tanggal yang sama', async () => {
  const { menuId } = await siapkanMenuHarian();
  await assert.rejects(
    () =>
      pool.query(
        `INSERT INTO daily_menu_items (tanggal, menu_item_id, harga, kuota)
         VALUES (DATE '2026-10-01', $1, 32000, 5)`,
        [menuId]
      ),
    (err) => err.code === '23505'
  );
});

test('status service_day selain open/closed ditolak', async () => {
  await assert.rejects(
    () =>
      pool.query(
        `INSERT INTO service_days (tanggal, status, batas_waktu_pesan)
         VALUES (DATE '2026-10-02', 'libur', TIMESTAMPTZ '2026-10-01 20:00:00+07')`
      ),
    (err) => err.code === '23514'
  );
});
