import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, withTransaction } from '../src/db.js';

after(async () => {
  await pool.end();
});

test('pool bisa terhubung ke database', async () => {
  const { rows } = await pool.query('SELECT 1 AS satu');
  assert.equal(rows[0].satu, 1);
});

test('withTransaction meng-commit saat berhasil', async () => {
  await pool.query('DROP TABLE IF EXISTS coba_transaksi');
  await pool.query('CREATE TABLE coba_transaksi (nilai INT)');

  await withTransaction(async (client) => {
    await client.query('INSERT INTO coba_transaksi (nilai) VALUES (1)');
  });

  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM coba_transaksi');
  assert.equal(rows[0].n, 1);
  await pool.query('DROP TABLE coba_transaksi');
});

test('withTransaction me-rollback saat gagal', async () => {
  await pool.query('DROP TABLE IF EXISTS coba_transaksi');
  await pool.query('CREATE TABLE coba_transaksi (nilai INT)');

  await assert.rejects(() =>
    withTransaction(async (client) => {
      await client.query('INSERT INTO coba_transaksi (nilai) VALUES (1)');
      throw new Error('sengaja gagal');
    })
  );

  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM coba_transaksi');
  assert.equal(rows[0].n, 0, 'baris seharusnya tidak tersimpan setelah rollback');
  await pool.query('DROP TABLE coba_transaksi');
});
