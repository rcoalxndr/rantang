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

function ambilCookie(res) {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

async function masukSebagai(peran, { nama = 'Uji', alamat = 'Jl. Uji 1' } = {}) {
  const email = `${peran}-${Date.now()}-${Math.random()}@contoh.test`;
  await kirim('/api/auth/register', {
    method: 'POST',
    body: { email, kataSandi: 'kata-sandi-aman', nama, alamat, telepon: '0811' },
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

const TANGGAL = '2030-01-01';
const CUTOFF = '2029-12-31T20:00:00+07:00';

async function siapkanHari(cookieDapur, kuota = 50) {
  const buat = await kirim('/api/dapur/menu-items', {
    method: 'POST',
    cookie: cookieDapur,
    body: { nama: `Katsu ${Math.random()}`, harga: 32000 },
  });
  const { item: menu } = await buat.json();
  const buka = await kirim('/api/dapur/service-days', {
    method: 'POST',
    cookie: cookieDapur,
    body: { tanggal: TANGGAL, batasWaktuPesan: CUTOFF, item: [{ menuItemId: menu.id, kuota }] },
  });
  return (await buka.json()).item[0].id;
}

async function isiSaldo(cookiePelanggan, cookieDapur, nominal) {
  const { topup } = await (
    await kirim('/api/topups', {
      method: 'POST',
      cookie: cookiePelanggan,
      body: { nominal, catatanBukti: 'uji' },
    })
  ).json();
  await kirim(`/api/dapur/topups/${topup.id}/approve`, { method: 'POST', cookie: cookieDapur });
}

test('pelanggan tidak bisa melihat daftar produksi', async () => {
  const dapur = await masukSebagai('dapur');
  const pelanggan = await masukSebagai('toko');
  await siapkanHari(dapur);

  const res = await kirim(`/api/dapur/production?tanggal=${TANGGAL}`, { cookie: pelanggan });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error.code, 'TIDAK_BERWENANG');
});

test('daftar antar tidak bisa dibuka tanpa masuk', async () => {
  const res = await kirim(`/api/dapur/deliveries?tanggal=${TANGGAL}`);
  assert.equal(res.status, 401);
});

test('dapur melihat daftar produksi dan daftar antar dari pesanan sungguhan', async () => {
  const dapur = await masukSebagai('dapur');
  const rico = await masukSebagai('toko', { nama: 'Rico', alamat: 'Jl. Melati No. 12' });
  const sinta = await masukSebagai('toko', { nama: 'Sinta', alamat: 'Jl. Kenanga No. 4' });
  const menuHarianId = await siapkanHari(dapur);

  await isiSaldo(rico, dapur, 500000);
  await isiSaldo(sinta, dapur, 500000);

  await kirim('/api/orders', {
    method: 'POST',
    cookie: rico,
    body: { tanggal: TANGGAL, item: [{ dailyMenuItemId: menuHarianId, jumlah: 3 }] },
  });
  await kirim('/api/orders', {
    method: 'POST',
    cookie: sinta,
    body: { tanggal: TANGGAL, item: [{ dailyMenuItemId: menuHarianId, jumlah: 2 }] },
  });

  const produksi = await (
    await kirim(`/api/dapur/production?tanggal=${TANGGAL}`, { cookie: dapur })
  ).json();
  assert.equal(produksi.totalUnit, 5);
  assert.equal(produksi.item[0].jumlah, 5);
  assert.equal(produksi.item[0].kuota, 50);

  const antar = await (
    await kirim(`/api/dapur/deliveries?tanggal=${TANGGAL}`, { cookie: dapur })
  ).json();
  assert.equal(antar.totalPesanan, 2);

  const alamat = antar.pesanan.map((p) => p.alamatAntar).sort();
  assert.deepEqual(alamat, ['Jl. Kenanga No. 4', 'Jl. Melati No. 12']);
});

test('dapur menandai pesanan terkirim lewat API', async () => {
  const dapur = await masukSebagai('dapur');
  const pelanggan = await masukSebagai('toko');
  const menuHarianId = await siapkanHari(dapur);
  await isiSaldo(pelanggan, dapur, 200000);

  const { pesanan } = await (
    await kirim('/api/orders', {
      method: 'POST',
      cookie: pelanggan,
      body: { tanggal: TANGGAL, item: [{ dailyMenuItemId: menuHarianId, jumlah: 1 }] },
    })
  ).json();

  const kirimkan = await kirim(`/api/dapur/orders/${pesanan.id}/deliver`, {
    method: 'POST',
    cookie: dapur,
  });
  assert.equal(kirimkan.status, 200);
  assert.equal((await kirimkan.json()).status, 'delivered');

  const dilihatPelanggan = await (
    await kirim(`/api/orders/${pesanan.id}`, { cookie: pelanggan })
  ).json();
  assert.equal(dilihatPelanggan.pesanan.status, 'delivered');

  const ulang = await kirim(`/api/dapur/orders/${pesanan.id}/deliver`, {
    method: 'POST',
    cookie: dapur,
  });
  assert.equal(ulang.status, 409);
  assert.equal((await ulang.json()).error.code, 'PESANAN_SUDAH_DIKIRIM');
});

test('pelanggan tidak bisa membatalkan pesanan yang sudah dikirim', async () => {
  const dapur = await masukSebagai('dapur');
  const pelanggan = await masukSebagai('toko');
  const menuHarianId = await siapkanHari(dapur);
  await isiSaldo(pelanggan, dapur, 200000);

  const { pesanan } = await (
    await kirim('/api/orders', {
      method: 'POST',
      cookie: pelanggan,
      body: { tanggal: TANGGAL, item: [{ dailyMenuItemId: menuHarianId, jumlah: 1 }] },
    })
  ).json();
  await kirim(`/api/dapur/orders/${pesanan.id}/deliver`, { method: 'POST', cookie: dapur });

  const batal = await kirim(`/api/orders/${pesanan.id}/cancel`, {
    method: 'POST',
    cookie: pelanggan,
  });
  assert.equal(batal.status, 409);
  assert.equal(
    (await batal.json()).error.code,
    'PESANAN_SUDAH_DIKIRIM',
    'pesan errornya harus menyebut alasan yang benar, bukan "sudah dibatalkan"'
  );

  const saldo = await (await kirim('/api/balance', { cookie: pelanggan })).json();
  assert.equal(saldo.saldo, 200000 - 32000, 'saldo tidak boleh dikembalikan');
});

test('tanggal tanpa parameter dijawab 422, bukan 500', async () => {
  const dapur = await masukSebagai('dapur');
  const res = await kirim('/api/dapur/production', { cookie: dapur });
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error.code, 'TANGGAL_TIDAK_VALID');
});
