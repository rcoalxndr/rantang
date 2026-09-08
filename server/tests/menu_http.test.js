import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { resetDatabase } from './helper.js';
import { buatApp } from '../src/app.js';

let server;
let base;

before(async () => {
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

function ambilCookie(res) {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

async function masukSebagai(peran) {
  const email = `${peran}-${Date.now()}-${Math.random()}@contoh.test`;
  await kirim('/api/auth/register', {
    method: 'POST',
    body: { email, kataSandi: 'kata-sandi-aman', nama: 'Uji', alamat: 'Jl. Uji 1' },
  });
  if (peran === 'dapur') {
    await pool.query(`UPDATE users SET peran = 'dapur' WHERE email = $1`, [email]);
  }
  const login = await kirim('/api/auth/login', {
    method: 'POST',
    body: { email, kataSandi: 'kata-sandi-aman' },
  });
  return ambilCookie(login);
}

const BESOK = '2026-10-01';
const CUTOFF = '2026-09-30T20:00:00+07:00';

test('pelanggan tidak boleh menyentuh endpoint dapur', async () => {
  const cookie = await masukSebagai('toko');

  const buatMenu = await kirim('/api/dapur/menu-items', {
    method: 'POST',
    cookie,
    body: { nama: 'Nakal', harga: 1000 },
  });
  assert.equal(buatMenu.status, 403);
  assert.equal((await buatMenu.json()).error.code, 'TIDAK_BERWENANG');

  const bukaTanggal = await kirim('/api/dapur/service-days', {
    method: 'POST',
    cookie,
    body: { tanggal: BESOK, batasWaktuPesan: CUTOFF, item: [] },
  });
  assert.equal(bukaTanggal.status, 403);
});

test('tanpa masuk sama sekali, endpoint dapur menjawab 401', async () => {
  const res = await kirim('/api/dapur/menu-items');
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.code, 'BELUM_MASUK');
});

test('dapur bisa membuat menu lalu membuka tanggal layanan', async () => {
  const cookie = await masukSebagai('dapur');

  const buat = await kirim('/api/dapur/menu-items', {
    method: 'POST',
    cookie,
    body: { nama: 'Katsu Ayam Saus Rendang', deskripsi: 'Enak', harga: 32000 },
  });
  assert.equal(buat.status, 201);
  const { item: menu } = await buat.json();
  assert.equal(menu.harga, 32000);

  const buka = await kirim('/api/dapur/service-days', {
    method: 'POST',
    cookie,
    body: { tanggal: BESOK, batasWaktuPesan: CUTOFF, item: [{ menuItemId: menu.id, kuota: 40 }] },
  });
  assert.equal(buka.status, 201);

  const hasil = await buka.json();
  assert.equal(hasil.tanggal, BESOK);
  assert.equal(hasil.item[0].kuota, 40);
});

test('membuka tanggal dengan kuota tidak valid dijawab 422', async () => {
  const cookie = await masukSebagai('dapur');
  const buat = await kirim('/api/dapur/menu-items', {
    method: 'POST',
    cookie,
    body: { nama: 'Menu', harga: 20000 },
  });
  const { item: menu } = await buat.json();

  const res = await kirim('/api/dapur/service-days', {
    method: 'POST',
    cookie,
    body: { tanggal: BESOK, batasWaktuPesan: CUTOFF, item: [{ menuItemId: menu.id, kuota: 0 }] },
  });

  assert.equal(res.status, 422);
  assert.equal((await res.json()).error.code, 'KUOTA_TIDAK_VALID');
});

test('menu publik bisa dilihat tanpa masuk', async () => {
  const cookie = await masukSebagai('dapur');
  const buat = await kirim('/api/dapur/menu-items', {
    method: 'POST',
    cookie,
    body: { nama: 'Ayam Bakar Bumbu Bali', harga: 30000 },
  });
  const { item: menu } = await buat.json();
  await kirim('/api/dapur/service-days', {
    method: 'POST',
    cookie,
    body: { tanggal: BESOK, batasWaktuPesan: CUTOFF, item: [{ menuItemId: menu.id, kuota: 25 }] },
  });

  // Tanpa cookie sama sekali.
  const res = await kirim(`/api/menu?tanggal=${BESOK}`);
  assert.equal(res.status, 200);

  const hasil = await res.json();
  assert.equal(hasil.tanggal, BESOK);
  assert.equal(hasil.item[0].nama, 'Ayam Bakar Bumbu Bali');
  assert.equal(hasil.item[0].sisa, 25);
  assert.equal(hasil.masihBisaPesan, true);
});

test('tanggal yang belum dibuka dijawab 404', async () => {
  const res = await kirim('/api/menu?tanggal=2030-12-25');
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error.code, 'TANGGAL_LAYANAN_TIDAK_DITEMUKAN');
});

test('tanggal tidak berformat dijawab 422', async () => {
  const res = await kirim('/api/menu?tanggal=besok-aja');
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error.code, 'TANGGAL_TIDAK_VALID');
});

test('daftar tanggal layanan bisa dilihat publik', async () => {
  const cookie = await masukSebagai('dapur');
  const buat = await kirim('/api/dapur/menu-items', {
    method: 'POST',
    cookie,
    body: { nama: 'Menu', harga: 20000 },
  });
  const { item: menu } = await buat.json();
  await kirim('/api/dapur/service-days', {
    method: 'POST',
    cookie,
    body: { tanggal: BESOK, batasWaktuPesan: CUTOFF, item: [{ menuItemId: menu.id, kuota: 12 }] },
  });

  const res = await kirim('/api/service-days');
  assert.equal(res.status, 200);

  const { tanggal } = await res.json();
  assert.equal(tanggal.length, 1);
  assert.equal(tanggal[0].tanggal, BESOK);
  assert.equal(tanggal[0].sisaTotal, 12);
});

test('dapur bisa menutup tanggal, menu jadi tidak bisa dipesan', async () => {
  const cookie = await masukSebagai('dapur');
  const buat = await kirim('/api/dapur/menu-items', {
    method: 'POST',
    cookie,
    body: { nama: 'Menu', harga: 20000 },
  });
  const { item: menu } = await buat.json();
  await kirim('/api/dapur/service-days', {
    method: 'POST',
    cookie,
    body: { tanggal: BESOK, batasWaktuPesan: CUTOFF, item: [{ menuItemId: menu.id, kuota: 12 }] },
  });

  const tutup = await kirim(`/api/dapur/service-days/${BESOK}/close`, {
    method: 'POST',
    cookie,
  });
  assert.equal(tutup.status, 204);

  const hasil = await (await kirim(`/api/menu?tanggal=${BESOK}`)).json();
  assert.equal(hasil.status, 'closed');
  assert.equal(hasil.masihBisaPesan, false);
});
