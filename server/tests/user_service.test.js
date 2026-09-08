import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { resetDatabase } from './helper.js';
import { daftar, masuk, keluar } from '../src/services/user.js';
import { ambilSesi } from '../src/auth/session.js';
import {
  EmailSudahDipakai,
  EmailTidakValid,
  KredensialSalah,
  KataSandiTerlaluPendek,
  NamaKosong,
} from '../src/errors.js';

after(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDatabase();
});

const AKUN = {
  email: 'rico@contoh.test',
  kataSandi: 'kata-sandi-aman',
  nama: 'Rico',
  alamat: 'Jl. Melati No. 12',
};

test('pendaftaran membuat user dengan peran toko dan saldo nol', async () => {
  const user = await daftar(AKUN);
  assert.equal(user.email, 'rico@contoh.test');
  assert.equal(user.peran, 'toko');
  assert.equal(Number(user.saldo), 0);
  assert.ok(user.id);
});

test('pendaftaran tidak pernah mengembalikan hash kata sandi', async () => {
  const user = await daftar(AKUN);
  assert.equal(user.password_hash, undefined);
  assert.ok(!JSON.stringify(user).includes('scrypt'));
});

test('kata sandi tersimpan sebagai hash, bukan teks polos', async () => {
  await daftar(AKUN);
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE email = $1', [
    AKUN.email,
  ]);
  assert.ok(rows[0].password_hash.startsWith('scrypt$'));
  assert.ok(!rows[0].password_hash.includes(AKUN.kataSandi));
});

test('email dinormalkan jadi huruf kecil dan dipangkas', async () => {
  const user = await daftar({ ...AKUN, email: '  RicO@Contoh.TEST  ' });
  assert.equal(user.email, 'rico@contoh.test');
});

test('email yang sudah dipakai ditolak', async () => {
  await daftar(AKUN);
  await assert.rejects(() => daftar({ ...AKUN, nama: 'Orang Lain' }), EmailSudahDipakai);
});

test('email yang sama dengan huruf berbeda tetap dianggap duplikat', async () => {
  await daftar(AKUN);
  await assert.rejects(() => daftar({ ...AKUN, email: 'RICO@CONTOH.TEST' }), EmailSudahDipakai);
});

test('email tidak valid ditolak', async () => {
  await assert.rejects(() => daftar({ ...AKUN, email: 'bukan-email' }), EmailTidakValid);
  await assert.rejects(() => daftar({ ...AKUN, email: '' }), EmailTidakValid);
  await assert.rejects(() => daftar({ ...AKUN, email: null }), EmailTidakValid);
});

test('kata sandi terlalu pendek ditolak dan user tidak terbuat', async () => {
  await assert.rejects(() => daftar({ ...AKUN, kataSandi: 'pendek' }), KataSandiTerlaluPendek);
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM users');
  assert.equal(rows[0].n, 0, 'user tidak boleh terbuat kalau kata sandinya ditolak');
});

test('nama kosong ditolak', async () => {
  await assert.rejects(() => daftar({ ...AKUN, nama: '   ' }), NamaKosong);
});

test('masuk dengan kredensial benar menghasilkan sesi', async () => {
  const user = await daftar(AKUN);
  const hasil = await masuk({ email: AKUN.email, kataSandi: AKUN.kataSandi });

  assert.equal(String(hasil.user.id), String(user.id));
  assert.ok(hasil.sesi.id);

  const sesi = await ambilSesi(hasil.sesi.id);
  assert.equal(String(sesi.user_id), String(user.id));
});

test('masuk dengan kata sandi salah ditolak', async () => {
  await daftar(AKUN);
  await assert.rejects(
    () => masuk({ email: AKUN.email, kataSandi: 'kata-sandi-salah' }),
    KredensialSalah
  );
});

test('masuk dengan email tak terdaftar memberi error yang sama persis', async () => {
  await daftar(AKUN);
  await assert.rejects(
    () => masuk({ email: 'entah@contoh.test', kataSandi: AKUN.kataSandi }),
    (err) => err instanceof KredensialSalah && err.kode === 'KREDENSIAL_SALAH'
  );
});

test('masuk tidak membuat sesi kalau kredensialnya salah', async () => {
  await daftar(AKUN);
  await assert.rejects(() => masuk({ email: AKUN.email, kataSandi: 'salah-total' }));
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM sessions');
  assert.equal(rows[0].n, 0);
});

test('keluar menghapus sesinya', async () => {
  await daftar(AKUN);
  const { sesi } = await masuk({ email: AKUN.email, kataSandi: AKUN.kataSandi });

  await keluar(sesi.id);

  assert.equal(await ambilSesi(sesi.id), null);
});
