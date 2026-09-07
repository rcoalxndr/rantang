import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/auth/password.js';
import { KataSandiTerlaluPendek } from '../src/errors.js';

test('hash tidak pernah mengandung kata sandi aslinya', async () => {
  const hash = await hashPassword('rahasia-sekali');
  assert.ok(!hash.includes('rahasia-sekali'));
  assert.ok(hash.startsWith('scrypt$'));
});

test('verifikasi berhasil untuk kata sandi yang benar', async () => {
  const hash = await hashPassword('kata-sandi-benar');
  assert.equal(await verifyPassword('kata-sandi-benar', hash), true);
});

test('verifikasi gagal untuk kata sandi yang salah', async () => {
  const hash = await hashPassword('kata-sandi-benar');
  assert.equal(await verifyPassword('kata-sandi-salah', hash), false);
});

test('kata sandi sama menghasilkan hash berbeda (garam acak)', async () => {
  const a = await hashPassword('kata-sandi-sama');
  const b = await hashPassword('kata-sandi-sama');
  assert.notEqual(a, b, 'dua hash seharusnya berbeda karena garamnya acak');
  assert.equal(await verifyPassword('kata-sandi-sama', a), true);
  assert.equal(await verifyPassword('kata-sandi-sama', b), true);
});

test('kata sandi kurang dari 8 karakter ditolak', async () => {
  await assert.rejects(() => hashPassword('pendek'), KataSandiTerlaluPendek);
});

test('verifikasi menolak format tersimpan yang tidak dikenal tanpa melempar', async () => {
  assert.equal(await verifyPassword('apa-saja', 'bukan-format-yang-benar'), false);
  assert.equal(await verifyPassword('apa-saja', ''), false);
  assert.equal(await verifyPassword('apa-saja', null), false);
  assert.equal(await verifyPassword('apa-saja', 'md5$abc$def'), false);
});

test('verifikasi menolak masukan yang bukan string', async () => {
  const hash = await hashPassword('kata-sandi-benar');
  assert.equal(await verifyPassword(null, hash), false);
  assert.equal(await verifyPassword(12345678, hash), false);
});
