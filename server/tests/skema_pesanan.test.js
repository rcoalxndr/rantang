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

async function siapkan() {
  const user = await pool.query(
    `INSERT INTO users (email, password_hash, nama, alamat, saldo)
     VALUES ('pesan@contoh.test', 'h', 'Pemesan', 'Jl. Uji No. 1', 100000)
     RETURNING id`
  );
  await pool.query(
    `INSERT INTO service_days (tanggal, batas_waktu_pesan)
     VALUES (DATE '2026-10-01', TIMESTAMPTZ '2026-09-30 20:00:00+07')`
  );
  return { userId: user.rows[0].id };
}

test('pesanan bisa dibuat dan menyimpan alamat sebagai snapshot', async () => {
  const { userId } = await siapkan();
  const { rows } = await pool.query(
    `INSERT INTO orders (user_id, tanggal_layanan, total, alamat_antar)
     VALUES ($1, DATE '2026-10-01', 32000, 'Jl. Uji No. 1')
     RETURNING id, status, alamat_antar`,
    [userId]
  );
  assert.equal(rows[0].status, 'confirmed');
  assert.equal(rows[0].alamat_antar, 'Jl. Uji No. 1');
});

test('status pesanan yang tidak dikenal ditolak', async () => {
  const { userId } = await siapkan();
  await assert.rejects(
    () =>
      pool.query(
        `INSERT INTO orders (user_id, tanggal_layanan, status, total, alamat_antar)
         VALUES ($1, DATE '2026-10-01', 'dikirim', 32000, 'Jl. Uji No. 1')`,
        [userId]
      ),
    (err) => err.code === '23514'
  );
});

test('buku besar menolak jumlah nol', async () => {
  const { userId } = await siapkan();
  await assert.rejects(
    () =>
      pool.query(
        `INSERT INTO credit_ledger (user_id, jumlah, jenis) VALUES ($1, 0, 'topup')`,
        [userId]
      ),
    (err) => err.code === '23514'
  );
});

test('buku besar menerima jumlah negatif untuk pemotongan', async () => {
  const { userId } = await siapkan();
  const { rows } = await pool.query(
    `INSERT INTO credit_ledger (user_id, jumlah, jenis, catatan)
     VALUES ($1, -32000, 'order', 'pesanan uji') RETURNING id, jumlah`,
    [userId]
  );
  assert.equal(Number(rows[0].jumlah), -32000);
});

test('pengajuan isi saldo dimulai dengan status pending', async () => {
  const { userId } = await siapkan();
  const { rows } = await pool.query(
    `INSERT INTO topup_requests (user_id, nominal, catatan_bukti)
     VALUES ($1, 200000, 'transfer BCA 12.30') RETURNING status`,
    [userId]
  );
  assert.equal(rows[0].status, 'pending');
});

test('user yang punya pesanan tidak bisa dihapus', async () => {
  const { userId } = await siapkan();
  await pool.query(
    `INSERT INTO orders (user_id, tanggal_layanan, total, alamat_antar)
     VALUES ($1, DATE '2026-10-01', 32000, 'Jl. Uji No. 1')`,
    [userId]
  );
  await assert.rejects(
    () => pool.query('DELETE FROM users WHERE id = $1', [userId]),
    (err) => err.code === '23503',
    'foreign key seharusnya melindungi riwayat pesanan'
  );
});
