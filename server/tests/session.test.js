import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { resetDatabase } from './helper.js';
import { buatSesi, ambilSesi, hapusSesi, bersihkanSesiKedaluwarsa } from '../src/auth/session.js';

after(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDatabase();
});

async function buatUser(peran = 'customer') {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, nama, peran)
     VALUES ($1, 'h', 'Uji', $2) RETURNING id`,
    [`sesi-${Date.now()}-${Math.random()}@contoh.test`, peran]
  );
  return rows[0].id;
}

test('sesi baru bisa dibuat dan dibaca kembali', async () => {
  const userId = await buatUser('kitchen');
  const sesi = await buatSesi(userId);

  const hasil = await ambilSesi(sesi.id);
  assert.equal(String(hasil.user_id), String(userId));
  assert.equal(hasil.peran, 'kitchen');
});

test('id sesi panjang dan tidak mudah ditebak', async () => {
  const userId = await buatUser();
  const a = await buatSesi(userId);
  const b = await buatSesi(userId);

  assert.ok(a.id.length >= 40, `id sesi terlalu pendek: ${a.id.length}`);
  assert.notEqual(a.id, b.id);
});

test('id sesi yang tidak dikenal menghasilkan null', async () => {
  assert.equal(await ambilSesi('id-yang-tidak-pernah-ada'), null);
  assert.equal(await ambilSesi(''), null);
  assert.equal(await ambilSesi(null), null);
});

test('sesi kedaluwarsa ditolak', async () => {
  const userId = await buatUser();
  await pool.query(
    `INSERT INTO sessions (id, user_id, kedaluwarsa)
     VALUES ('sesi-basi', $1, now() - INTERVAL '1 second')`,
    [userId]
  );
  assert.equal(await ambilSesi('sesi-basi'), null);
});

test('sesi yang dihapus tidak bisa dipakai lagi', async () => {
  const userId = await buatUser();
  const sesi = await buatSesi(userId);
  assert.ok(await ambilSesi(sesi.id));

  await hapusSesi(sesi.id);
  assert.equal(await ambilSesi(sesi.id), null);
});

test('menghapus user ikut menghapus sesinya', async () => {
  const userId = await buatUser();
  const sesi = await buatSesi(userId);

  await pool.query('DELETE FROM users WHERE id = $1', [userId]);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM sessions WHERE id = $1', [
    sesi.id,
  ]);
  assert.equal(rows[0].n, 0, 'ON DELETE CASCADE seharusnya ikut menghapus sesi');
});

test('pembersihan hanya menghapus sesi yang sudah kedaluwarsa', async () => {
  const userId = await buatUser();
  const masihHidup = await buatSesi(userId);
  await pool.query(
    `INSERT INTO sessions (id, user_id, kedaluwarsa)
     VALUES ('sesi-basi', $1, now() - INTERVAL '1 day')`,
    [userId]
  );

  const terhapus = await bersihkanSesiKedaluwarsa();

  assert.equal(terhapus, 1);
  assert.ok(await ambilSesi(masihHidup.id), 'sesi yang masih berlaku tidak boleh ikut terhapus');
});
