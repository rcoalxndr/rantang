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

async function buatUser(saldo = 0, peran = 'toko') {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, nama, alamat, peran, saldo)
     VALUES ($1, 'hash-sementara', 'Uji', 'Jl. Uji No. 1', $2, $3)
     RETURNING id, saldo, peran`,
    [`uji-${Date.now()}-${Math.random()}@contoh.test`, peran, saldo]
  );
  return rows[0];
}

test('user baru bisa dibuat dengan saldo nol', async () => {
  const user = await buatUser();
  assert.equal(Number(user.saldo), 0);
  assert.equal(user.peran, 'toko');
});

test('saldo tidak boleh minus', async () => {
  await assert.rejects(
    () => buatUser(-1),
    (err) => err.code === '23514',
    'seharusnya ditolak oleh CHECK constraint (kode 23514)'
  );
});

test('saldo tidak bisa dibuat minus lewat UPDATE', async () => {
  const user = await buatUser(10000);
  await assert.rejects(
    () => pool.query('UPDATE users SET saldo = saldo - $1 WHERE id = $2', [20000, user.id]),
    (err) => err.code === '23514'
  );
});

test('peran selain toko/dapur ditolak', async () => {
  await assert.rejects(
    () => buatUser(0, 'admin'),
    (err) => err.code === '23514'
  );
});

test('email harus unik', async () => {
  await pool.query(
    `INSERT INTO users (email, password_hash, nama) VALUES ('sama@contoh.test','h','A')`
  );
  await assert.rejects(
    () =>
      pool.query(
        `INSERT INTO users (email, password_hash, nama) VALUES ('sama@contoh.test','h','B')`
      ),
    (err) => err.code === '23505',
    'seharusnya ditolak oleh UNIQUE constraint (kode 23505)'
  );
});
