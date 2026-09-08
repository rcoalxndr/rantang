import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { resetDatabase } from './helper.js';
import { buatApp } from '../src/app.js';

let server;
let base;

before(async () => {
  server = buatApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
  await pool.end();
});

beforeEach(async () => {
  await resetDatabase();
});

function kirim(jalur, opsi = {}) {
  return fetch(`${base}${jalur}`, {
    method: opsi.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opsi.cookie ? { Cookie: opsi.cookie } : {}),
    },
    body: opsi.body ? JSON.stringify(opsi.body) : undefined,
  });
}

const ambilCookie = (res) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');

async function buatAkun(peran, nama = 'Uji') {
  const email = `${peran}-${Date.now()}-${Math.random()}@contoh.test`;
  const daftar = await kirim('/api/auth/register', {
    method: 'POST',
    body: { email, kataSandi: 'kata-sandi-aman', nama, pic: 'PIC Uji', alamat: 'Jl. Uji 1' },
  });
  const { user } = await daftar.json();
  if (peran === 'dapur') {
    await pool.query(`UPDATE users SET peran = 'dapur' WHERE id = $1`, [user.id]);
  }
  const login = await kirim('/api/auth/login', {
    method: 'POST',
    body: { email, kataSandi: 'kata-sandi-aman' },
  });
  return { id: user.id, email, cookie: ambilCookie(login) };
}

// ---------------------------------------------------------------------------
// Daftar toko
// ---------------------------------------------------------------------------

test('dapur melihat daftar toko beserta angka yang menentukan keputusan', async () => {
  const dapur = await buatAkun('dapur');
  await buatAkun('toko', 'Toserba Melati');
  await buatAkun('toko', 'Warung Kenanga');

  const { toko } = await (await kirim('/api/dapur/toko', { cookie: dapur.cookie })).json();

  assert.equal(toko.length, 2);
  const satu = toko[0];
  for (const kolom of ['nama', 'pic', 'email', 'saldo', 'aktif', 'jumlahPesanan']) {
    assert.ok(kolom in satu, `kolom ${kolom} harus ada`);
  }
  assert.equal(satu.aktif, true);
  assert.equal(satu.jumlahPesanan, 0);
});

test('daftar toko tidak memuat akun dapur', async () => {
  const dapur = await buatAkun('dapur');
  await buatAkun('toko');

  const { toko } = await (await kirim('/api/dapur/toko', { cookie: dapur.cookie })).json();
  assert.equal(toko.length, 1);
});

test('toko tidak boleh melihat daftar toko', async () => {
  await buatAkun('dapur');
  const toko = await buatAkun('toko');

  const res = await kirim('/api/dapur/toko', { cookie: toko.cookie });
  assert.equal(res.status, 403);
});

// ---------------------------------------------------------------------------
// Menonaktifkan akun
// ---------------------------------------------------------------------------

test('toko yang dinonaktifkan langsung kehilangan akses, tanpa menunggu cookie kedaluwarsa', async () => {
  const dapur = await buatAkun('dapur');
  const toko = await buatAkun('toko');

  assert.equal((await kirim('/api/auth/me', { cookie: toko.cookie })).status, 200);

  const matikan = await kirim(`/api/dapur/toko/${toko.id}/nonaktifkan`, {
    method: 'POST',
    cookie: dapur.cookie,
  });
  assert.equal(matikan.status, 200);
  assert.equal((await matikan.json()).aktif, false);

  assert.equal(
    (await kirim('/api/auth/me', { cookie: toko.cookie })).status,
    401,
    'sesi yang sudah berjalan harus ikut mati saat itu juga'
  );
});

test('akun nonaktif tidak bisa masuk lagi, dengan pesan yang jelas', async () => {
  const dapur = await buatAkun('dapur');
  const toko = await buatAkun('toko');
  await kirim(`/api/dapur/toko/${toko.id}/nonaktifkan`, { method: 'POST', cookie: dapur.cookie });

  const res = await kirim('/api/auth/login', {
    method: 'POST',
    body: { email: toko.email, kataSandi: 'kata-sandi-aman' },
  });

  assert.equal(res.status, 403);
  assert.equal((await res.json()).error.code, 'AKUN_NONAKTIF');
});

test('kata sandi salah pada akun nonaktif tetap dijawab kredensial salah', async () => {
  const dapur = await buatAkun('dapur');
  const toko = await buatAkun('toko');
  await kirim(`/api/dapur/toko/${toko.id}/nonaktifkan`, { method: 'POST', cookie: dapur.cookie });

  const res = await kirim('/api/auth/login', {
    method: 'POST',
    body: { email: toko.email, kataSandi: 'tebakan-salah' },
  });

  assert.equal(
    (await res.json()).error.code,
    'KREDENSIAL_SALAH',
    'status nonaktif tidak boleh bocor ke orang yang menebak kata sandi'
  );
});

test('akun bisa diaktifkan kembali', async () => {
  const dapur = await buatAkun('dapur');
  const toko = await buatAkun('toko');
  await kirim(`/api/dapur/toko/${toko.id}/nonaktifkan`, { method: 'POST', cookie: dapur.cookie });
  await kirim(`/api/dapur/toko/${toko.id}/aktifkan`, { method: 'POST', cookie: dapur.cookie });

  const res = await kirim('/api/auth/login', {
    method: 'POST',
    body: { email: toko.email, kataSandi: 'kata-sandi-aman' },
  });
  assert.equal(res.status, 200);
});

test('menonaktifkan tidak menghapus riwayatnya', async () => {
  const dapur = await buatAkun('dapur');
  const toko = await buatAkun('toko');
  await kirim(`/api/dapur/toko/${toko.id}/nonaktifkan`, { method: 'POST', cookie: dapur.cookie });

  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM users WHERE id = $1', [toko.id]);
  assert.equal(rows[0].n, 1, 'barisnya tetap ada, hanya ditandai nonaktif');
});

// ---------------------------------------------------------------------------
// Koreksi deposit
// ---------------------------------------------------------------------------

async function beriDeposit(dapur, toko, nominal) {
  const { topup } = await (
    await kirim('/api/topups', {
      method: 'POST',
      cookie: toko.cookie,
      body: { nominal, catatanBukti: 'uji' },
    })
  ).json();
  await kirim(`/api/dapur/topups/${topup.id}/approve`, { method: 'POST', cookie: dapur.cookie });
}

test('dapur bisa menarik kembali deposit yang salah disetujui', async () => {
  const dapur = await buatAkun('dapur');
  const toko = await buatAkun('toko');
  await beriDeposit(dapur, toko, 200000);

  const res = await kirim(`/api/dapur/toko/${toko.id}/koreksi-deposit`, {
    method: 'POST',
    cookie: dapur.cookie,
    body: { jumlah: -200000, catatan: 'transfer tidak masuk, salah baca mutasi' },
  });

  assert.equal(res.status, 200);
  assert.equal((await res.json()).saldoBaru, 0);

  const { rows } = await pool.query(
    `SELECT jenis, jumlah, catatan FROM credit_ledger WHERE user_id = $1 ORDER BY id`,
    [toko.id]
  );
  assert.deepEqual(
    rows.map((r) => r.jenis),
    ['topup', 'koreksi'],
    'catatan lama tidak boleh dihapus — koreksi adalah baris baru'
  );
  assert.match(rows[1].catatan, /salah baca mutasi/);
  assert.match(rows[1].catatan, /oleh dapur/);
});

test('koreksi tidak boleh membuat deposit jadi minus', async () => {
  const dapur = await buatAkun('dapur');
  const toko = await buatAkun('toko');
  await beriDeposit(dapur, toko, 50000);

  const res = await kirim(`/api/dapur/toko/${toko.id}/koreksi-deposit`, {
    method: 'POST',
    cookie: dapur.cookie,
    body: { jumlah: -80000, catatan: 'coba menarik lebih dari yang ada' },
  });

  assert.equal(res.status, 409);
  assert.equal((await res.json()).error.code, 'SALDO_TIDAK_CUKUP');

  const { rows } = await pool.query('SELECT saldo FROM users WHERE id = $1', [toko.id]);
  assert.equal(rows[0].saldo, 50000, 'deposit tidak boleh berubah kalau koreksinya ditolak');
});

test('koreksi tanpa catatan ditolak', async () => {
  const dapur = await buatAkun('dapur');
  const toko = await buatAkun('toko');
  await beriDeposit(dapur, toko, 100000);

  for (const catatan of ['', '  ', 'ok']) {
    const res = await kirim(`/api/dapur/toko/${toko.id}/koreksi-deposit`, {
      method: 'POST',
      cookie: dapur.cookie,
      body: { jumlah: -1000, catatan },
    });
    assert.equal(res.status, 422, `catatan "${catatan}" seharusnya ditolak`);
    assert.equal((await res.json()).error.code, 'CATATAN_KOREKSI_WAJIB');
  }
});

test('koreksi positif menambah deposit dan tercatat', async () => {
  const dapur = await buatAkun('dapur');
  const toko = await buatAkun('toko');

  await kirim(`/api/dapur/toko/${toko.id}/koreksi-deposit`, {
    method: 'POST',
    cookie: dapur.cookie,
    body: { jumlah: 25000, catatan: 'kekurangan dari transfer sebelumnya' },
  });

  const { rows } = await pool.query(
    `SELECT u.saldo, COALESCE(SUM(l.jumlah), 0)::bigint AS buku
     FROM users u LEFT JOIN credit_ledger l ON l.user_id = u.id
     WHERE u.id = $1 GROUP BY u.saldo`,
    [toko.id]
  );
  assert.equal(rows[0].saldo, 25000);
  assert.equal(rows[0].buku, 25000, 'buku besar harus tetap seimbang dengan kolom saldo');
});

test('toko tidak bisa mengoreksi depositnya sendiri', async () => {
  await buatAkun('dapur');
  const toko = await buatAkun('toko');

  const res = await kirim(`/api/dapur/toko/${toko.id}/koreksi-deposit`, {
    method: 'POST',
    cookie: toko.cookie,
    body: { jumlah: 1000000, catatan: 'nambah sendiri' },
  });
  assert.equal(res.status, 403);
});

// ---------------------------------------------------------------------------
// Pembersihan
// ---------------------------------------------------------------------------

test('pembersihan membuang sesi kedaluwarsa tapi tidak yang masih berlaku', async () => {
  const dapur = await buatAkun('dapur');
  const toko = await buatAkun('toko');

  await pool.query(
    `INSERT INTO sessions (id, user_id, kedaluwarsa)
     VALUES ('sesi-basi', $1, now() - INTERVAL '1 day')`,
    [toko.id]
  );

  const hasil = await (
    await kirim('/api/dapur/bersihkan', { method: 'POST', cookie: dapur.cookie })
  ).json();

  assert.ok(hasil.sesi >= 1);
  assert.equal(
    (await kirim('/api/auth/me', { cookie: toko.cookie })).status,
    200,
    'sesi yang masih berlaku tidak boleh ikut terhapus'
  );
});
