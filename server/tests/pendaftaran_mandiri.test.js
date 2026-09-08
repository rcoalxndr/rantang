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

// Deposit percobaan bawaannya MATI. Berkas test ini menyalakannya sendiri,
// karena yang diuji justru pengalaman orang asing di lingkungan demo.
const DEPOSIT_SEBELUMNYA = process.env.DEPOSIT_AWAL;

before(() => {
  process.env.DEPOSIT_AWAL = '300000';
});

after(() => {
  if (DEPOSIT_SEBELUMNYA === undefined) delete process.env.DEPOSIT_AWAL;
  else process.env.DEPOSIT_AWAL = DEPOSIT_SEBELUMNYA;
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

/**
 * Uji jalur yang akan ditempuh orang asing yang membuka tautannya: mendaftar
 * sendiri, lalu langsung memakai sistemnya sampai selesai. Kalau jalur ini
 * putus, yang tersisa cuma akun contoh — dan itu tidak membuktikan apa pun.
 */
test('orang baru bisa mendaftar sendiri lalu langsung memesan', async () => {
  // Dapur menyiapkan hari produksi lebih dulu.
  const emailDapur = `dapur-${Date.now()}@contoh.test`;
  await kirim('/api/auth/register', {
    method: 'POST',
    body: { email: emailDapur, kataSandi: 'kata-sandi-aman', nama: 'Dapur', alamat: 'Dapur' },
  });
  await pool.query(`UPDATE users SET peran = 'dapur' WHERE email = $1`, [emailDapur]);
  const dapur = ambilCookie(
    await kirim('/api/auth/login', {
      method: 'POST',
      body: { email: emailDapur, kataSandi: 'kata-sandi-aman' },
    })
  );

  const { item: menu } = await (
    await kirim('/api/dapur/menu-items', {
      method: 'POST',
      cookie: dapur,
      body: { nama: 'Katsu Ayam', harga: 32000 },
    })
  ).json();
  const hari = await (
    await kirim('/api/dapur/service-days', {
      method: 'POST',
      cookie: dapur,
      body: {
        tanggal: '2030-01-01',
        batasWaktuPesan: '2029-12-31T20:00:00+07:00',
        item: [{ menuItemId: menu.id, kuota: 40 }],
      },
    })
  ).json();
  const menuHarianId = hari.item[0].id;

  // --- inilah yang dilakukan orang asing ---
  const emailBaru = `pengunjung-${Date.now()}@contoh.test`;
  const daftar = await kirim('/api/auth/register', {
    method: 'POST',
    body: {
      email: emailBaru,
      kataSandi: 'kata-sandi-aman',
      nama: 'Toko Pengunjung',
      pic: 'Pak Dosen',
      alamat: 'Jl. Kampus No. 1',
    },
  });
  assert.equal(daftar.status, 201);

  const { user } = await daftar.json();
  assert.ok(user.saldo > 0, 'akun baru harus punya deposit percobaan, bukan buntu di Rp 0');

  const masuk = await kirim('/api/auth/login', {
    method: 'POST',
    body: { email: emailBaru, kataSandi: 'kata-sandi-aman' },
  });
  const cookie = ambilCookie(masuk);

  const pesan = await kirim('/api/orders', {
    method: 'POST',
    cookie,
    body: { tanggal: '2030-01-01', item: [{ dailyMenuItemId: menuHarianId, jumlah: 3 }] },
  });
  assert.equal(pesan.status, 201, 'akun yang baru mendaftar harus bisa langsung memesan');

  const { pesanan } = await pesan.json();
  assert.equal(pesanan.total, 96000);
  assert.equal(pesanan.alamatAntar, 'Jl. Kampus No. 1');

  // Pesanannya benar-benar mengubah keadaan yang dilihat orang lain.
  const produksi = await (
    await kirim('/api/dapur/production?tanggal=2030-01-01', { cookie: dapur })
  ).json();
  assert.equal(produksi.totalUnit, 3, 'dapur harus melihat pesanan orang baru itu');

  const menuPublik = await (await kirim('/api/menu?tanggal=2030-01-01')).json();
  assert.equal(menuPublik.item[0].sisa, 37, 'sisa kuota yang dilihat publik ikut berkurang');
});

test('deposit percobaan tercatat di buku besar, bukan muncul dari ketiadaan', async () => {
  const email = `catat-${Date.now()}@contoh.test`;
  const res = await kirim('/api/auth/register', {
    method: 'POST',
    body: { email, kataSandi: 'kata-sandi-aman', nama: 'Uji', alamat: 'Jl. A' },
  });
  const { user } = await res.json();

  const { rows } = await pool.query(
    `SELECT u.saldo, COALESCE(SUM(l.jumlah), 0)::bigint AS buku
     FROM users u LEFT JOIN credit_ledger l ON l.user_id = u.id
     WHERE u.id = $1 GROUP BY u.saldo`,
    [user.id]
  );
  assert.equal(rows[0].saldo, rows[0].buku, 'buku besar harus tetap seimbang dengan kolom saldo');

  const jenis = await pool.query('SELECT jenis, catatan FROM credit_ledger WHERE user_id = $1', [
    user.id,
  ]);
  assert.equal(jenis.rows[0].jenis, 'topup');
  assert.match(jenis.rows[0].catatan, /percobaan/i);
});

test('pendaftaran yang ditolak tidak meninggalkan deposit menggantung', async () => {
  const email = `gagal-${Date.now()}@contoh.test`;
  await kirim('/api/auth/register', {
    method: 'POST',
    body: { email, kataSandi: 'pendek', nama: 'Uji', alamat: 'Jl. A' },
  });

  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM credit_ledger');
  assert.equal(rows[0].n, 0, 'tidak boleh ada catatan uang untuk akun yang tidak jadi dibuat');
});
