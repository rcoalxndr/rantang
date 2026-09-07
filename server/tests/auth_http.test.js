import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { pool } from '../src/db.js';
import { resetDatabase } from './helper.js';
import { buatApp } from '../src/app.js';
import { bacaCookie } from '../src/auth/cookie.js';
import { lampirkanSesi, wajibPeran } from '../src/auth/middleware.js';

let server;
let base;

before(async () => {
  // Port 0 = biarkan sistem memilih port yang bebas. Tidak ada bentrok dengan
  // server lain yang mungkin sedang jalan di 3000.
  server = buatApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
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

function kirim(jalur, opsi = {}) {
  return fetch(`${base}${jalur}`, {
    method: opsi.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opsi.cookie ? { Cookie: opsi.cookie } : {}),
      ...(opsi.headers ?? {}),
    },
    body: opsi.body ? JSON.stringify(opsi.body) : undefined,
  });
}

function ambilCookie(res) {
  const header = res.headers.getSetCookie?.() ?? [];
  return header.map((c) => c.split(';')[0]).join('; ');
}

test('health check menjawab', async () => {
  const res = await kirim('/api/health');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test('pendaftaran mengembalikan 201 dan data user tanpa hash', async () => {
  const res = await kirim('/api/auth/register', { method: 'POST', body: AKUN });
  assert.equal(res.status, 201);

  const { user } = await res.json();
  assert.equal(user.email, 'rico@contoh.test');
  assert.equal(user.peran, 'customer');
  assert.equal(user.password_hash, undefined);
});

test('email ganda dijawab 409 dengan kode yang jelas', async () => {
  await kirim('/api/auth/register', { method: 'POST', body: AKUN });
  const res = await kirim('/api/auth/register', { method: 'POST', body: AKUN });

  assert.equal(res.status, 409);
  const { error } = await res.json();
  assert.equal(error.code, 'EMAIL_SUDAH_DIPAKAI');
});

test('kata sandi pendek dijawab 422', async () => {
  const res = await kirim('/api/auth/register', {
    method: 'POST',
    body: { ...AKUN, kataSandi: 'pendek' },
  });
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error.code, 'KATA_SANDI_TERLALU_PENDEK');
});

test('masuk memasang cookie sesi yang httpOnly', async () => {
  await kirim('/api/auth/register', { method: 'POST', body: AKUN });
  const res = await kirim('/api/auth/login', {
    method: 'POST',
    body: { email: AKUN.email, kataSandi: AKUN.kataSandi },
  });

  assert.equal(res.status, 200);

  const setCookie = res.headers.getSetCookie();
  assert.equal(setCookie.length, 1);
  assert.match(setCookie[0], /^rantang_sesi=/);
  assert.match(setCookie[0], /HttpOnly/i, 'cookie sesi wajib HttpOnly');
  assert.match(setCookie[0], /SameSite=Lax/i);
});

test('kredensial salah dijawab 401 tanpa memasang cookie', async () => {
  await kirim('/api/auth/register', { method: 'POST', body: AKUN });
  const res = await kirim('/api/auth/login', {
    method: 'POST',
    body: { email: AKUN.email, kataSandi: 'salah-sekali' },
  });

  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.code, 'KREDENSIAL_SALAH');
  assert.equal(res.headers.getSetCookie().length, 0);
});

test('email tak terdaftar dijawab persis sama dengan kata sandi salah', async () => {
  await kirim('/api/auth/register', { method: 'POST', body: AKUN });

  const a = await kirim('/api/auth/login', {
    method: 'POST',
    body: { email: AKUN.email, kataSandi: 'salah-sekali' },
  });
  const b = await kirim('/api/auth/login', {
    method: 'POST',
    body: { email: 'entah@contoh.test', kataSandi: 'salah-sekali' },
  });

  assert.equal(a.status, b.status);
  assert.deepEqual(await a.json(), await b.json());
});

test('/me ditolak 401 tanpa cookie', async () => {
  const res = await kirim('/api/auth/me');
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.code, 'BELUM_MASUK');
});

test('/me berhasil dengan cookie sesi', async () => {
  await kirim('/api/auth/register', { method: 'POST', body: AKUN });
  const login = await kirim('/api/auth/login', {
    method: 'POST',
    body: { email: AKUN.email, kataSandi: AKUN.kataSandi },
  });

  const res = await kirim('/api/auth/me', { cookie: ambilCookie(login) });

  assert.equal(res.status, 200);
  const { user } = await res.json();
  assert.equal(user.email, 'rico@contoh.test');
});

test('cookie sesi palsu ditolak', async () => {
  const res = await kirim('/api/auth/me', { cookie: 'rantang_sesi=coba-tebak-saja' });
  assert.equal(res.status, 401);
});

test('keluar membuat sesi tidak bisa dipakai lagi', async () => {
  await kirim('/api/auth/register', { method: 'POST', body: AKUN });
  const login = await kirim('/api/auth/login', {
    method: 'POST',
    body: { email: AKUN.email, kataSandi: AKUN.kataSandi },
  });
  const cookie = ambilCookie(login);

  assert.equal((await kirim('/api/auth/me', { cookie })).status, 200);

  const logout = await kirim('/api/auth/logout', { method: 'POST', cookie });
  assert.equal(logout.status, 204);

  // Cookie yang sama dicoba lagi: sesinya sudah dihapus dari database, jadi
  // percuma meski cookienya masih dipegang.
  assert.equal((await kirim('/api/auth/me', { cookie })).status, 401);
});

test('endpoint tak dikenal dijawab 404 berbentuk JSON', async () => {
  const res = await kirim('/api/entah-apa');
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error.code, 'TIDAK_DITEMUKAN');
});

test('CORS: origin yang diizinkan dipantulkan, yang lain tidak', async () => {
  const boleh = await kirim('/api/health', { headers: { Origin: 'http://localhost:5173' } });
  assert.equal(boleh.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal(boleh.headers.get('access-control-allow-credentials'), 'true');

  const tidak = await kirim('/api/health', { headers: { Origin: 'http://jahat.contoh' } });
  assert.equal(tidak.headers.get('access-control-allow-origin'), null);
});

test('CORS: preflight OPTIONS dijawab 204', async () => {
  const res = await kirim('/api/auth/login', {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:5173' },
  });
  assert.equal(res.status, 204);
  assert.match(res.headers.get('access-control-allow-methods'), /POST/);
});

test('wajibPeran menolak peran yang salah dengan 403', async () => {
  // App mini khusus test: menguji middleware-nya sendiri, tanpa perlu membuat
  // endpoint dapur palsu di kode produksi.
  const mini = express();
  mini.use(bacaCookie);
  mini.use(lampirkanSesi);
  mini.get('/khusus-dapur', wajibPeran('kitchen'), (_req, res) => res.json({ ok: true }));
  mini.use((err, _req, res, _next) =>
    res.status(err.status ?? 500).json({ error: { code: err.kode } })
  );

  const miniServer = mini.listen(0);
  await new Promise((r) => miniServer.once('listening', r));
  const miniBase = `http://127.0.0.1:${miniServer.address().port}`;

  try {
    await kirim('/api/auth/register', { method: 'POST', body: AKUN });
    const login = await kirim('/api/auth/login', {
      method: 'POST',
      body: { email: AKUN.email, kataSandi: AKUN.kataSandi },
    });
    const cookie = ambilCookie(login);

    const tanpaMasuk = await fetch(`${miniBase}/khusus-dapur`);
    assert.equal(tanpaMasuk.status, 401);

    const sebagaiPelanggan = await fetch(`${miniBase}/khusus-dapur`, { headers: { Cookie: cookie } });
    assert.equal(sebagaiPelanggan.status, 403);
    assert.equal((await sebagaiPelanggan.json()).error.code, 'TIDAK_BERWENANG');

    // Naikkan perannya jadi dapur, cookie yang sama sekarang boleh masuk.
    await pool.query(`UPDATE users SET peran = 'kitchen' WHERE email = $1`, [AKUN.email]);
    const sebagaiDapur = await fetch(`${miniBase}/khusus-dapur`, { headers: { Cookie: cookie } });
    assert.equal(sebagaiDapur.status, 200);
  } finally {
    await new Promise((r) => miniServer.close(r));
  }
});
