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

async function masukSebagai(peran, alamat = 'Jl. Melati No. 12') {
  const email = `${peran}-${Date.now()}-${Math.random()}@contoh.test`;
  await kirim('/api/auth/register', {
    method: 'POST',
    body: { email, kataSandi: 'kata-sandi-aman', nama: 'Uji', alamat },
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

/** Membuka satu tanggal layanan lewat API dapur, mengembalikan id menu harian. */
async function siapkanHari(cookieDapur, kuota = 10, harga = 32000) {
  const buat = await kirim('/api/dapur/menu-items', {
    method: 'POST',
    cookie: cookieDapur,
    body: { nama: `Katsu ${Math.random()}`, harga },
  });
  const { item: menu } = await buat.json();

  const buka = await kirim('/api/dapur/service-days', {
    method: 'POST',
    cookie: cookieDapur,
    body: { tanggal: TANGGAL, batasWaktuPesan: CUTOFF, item: [{ menuItemId: menu.id, kuota }] },
  });
  const hari = await buka.json();
  return hari.item[0].id;
}

/** Mengisi saldo pelanggan lewat alur lengkap: ajukan lalu dapur menyetujui. */
async function isiSaldo(cookiePelanggan, cookieDapur, nominal) {
  const ajukan = await kirim('/api/topups', {
    method: 'POST',
    cookie: cookiePelanggan,
    body: { nominal, catatanBukti: 'transfer uji' },
  });
  const { topup } = await ajukan.json();

  const setujui = await kirim(`/api/dapur/topups/${topup.id}/approve`, {
    method: 'POST',
    cookie: cookieDapur,
  });
  return setujui;
}

test('alur lengkap: isi saldo, pesan, lihat, batalkan', async () => {
  const dapur = await masukSebagai('dapur');
  const pelanggan = await masukSebagai('toko', 'Jl. Kenanga No. 4');
  const menuHarianId = await siapkanHari(dapur, 10);

  const isi = await isiSaldo(pelanggan, dapur, 200000);
  assert.equal(isi.status, 200);
  assert.equal((await isi.json()).saldoBaru, 200000);

  const pesan = await kirim('/api/orders', {
    method: 'POST',
    cookie: pelanggan,
    body: { tanggal: TANGGAL, item: [{ dailyMenuItemId: menuHarianId, jumlah: 2 }] },
  });
  assert.equal(pesan.status, 201);
  const { pesanan } = await pesan.json();
  assert.equal(pesanan.total, 64000);
  assert.equal(pesanan.alamatAntar, 'Jl. Kenanga No. 4');

  const saldo = await (await kirim('/api/balance', { cookie: pelanggan })).json();
  assert.equal(saldo.saldo, 136000);
  assert.deepEqual(
    saldo.riwayat.map((r) => r.jenis),
    ['order', 'topup'],
    'riwayat terbaru di atas'
  );

  const batal = await kirim(`/api/orders/${pesanan.id}/cancel`, {
    method: 'POST',
    cookie: pelanggan,
  });
  assert.equal(batal.status, 204);

  const saldoAkhir = await (await kirim('/api/balance', { cookie: pelanggan })).json();
  assert.equal(saldoAkhir.saldo, 200000);
});

test('memesan tanpa saldo dijawab 409', async () => {
  const dapur = await masukSebagai('dapur');
  const pelanggan = await masukSebagai('toko');
  const menuHarianId = await siapkanHari(dapur);

  const res = await kirim('/api/orders', {
    method: 'POST',
    cookie: pelanggan,
    body: { tanggal: TANGGAL, item: [{ dailyMenuItemId: menuHarianId, jumlah: 1 }] },
  });

  assert.equal(res.status, 409);
  assert.equal((await res.json()).error.code, 'SALDO_TIDAK_CUKUP');
});

test('memesan melebihi kuota dijawab 409 KUOTA_HABIS', async () => {
  const dapur = await masukSebagai('dapur');
  const pelanggan = await masukSebagai('toko');
  const menuHarianId = await siapkanHari(dapur, 1);
  await isiSaldo(pelanggan, dapur, 500000);

  const res = await kirim('/api/orders', {
    method: 'POST',
    cookie: pelanggan,
    body: { tanggal: TANGGAL, item: [{ dailyMenuItemId: menuHarianId, jumlah: 2 }] },
  });

  assert.equal(res.status, 409);
  assert.equal((await res.json()).error.code, 'KUOTA_HABIS');
});

test('memesan tanpa masuk dijawab 401', async () => {
  const res = await kirim('/api/orders', {
    method: 'POST',
    body: { tanggal: TANGGAL, item: [] },
  });
  assert.equal(res.status, 401);
});

test('pelanggan lain tidak bisa membuka pesanan yang bukan miliknya', async () => {
  const dapur = await masukSebagai('dapur');
  const pemilik = await masukSebagai('toko');
  const orangLain = await masukSebagai('toko');
  const menuHarianId = await siapkanHari(dapur);
  await isiSaldo(pemilik, dapur, 200000);

  const { pesanan } = await (
    await kirim('/api/orders', {
      method: 'POST',
      cookie: pemilik,
      body: { tanggal: TANGGAL, item: [{ dailyMenuItemId: menuHarianId, jumlah: 1 }] },
    })
  ).json();

  const baca = await kirim(`/api/orders/${pesanan.id}`, { cookie: orangLain });
  assert.equal(baca.status, 403);
  assert.equal((await baca.json()).error.code, 'TIDAK_BERWENANG');

  const batal = await kirim(`/api/orders/${pesanan.id}/cancel`, {
    method: 'POST',
    cookie: orangLain,
  });
  assert.equal(batal.status, 403);
});

test('pelanggan tidak bisa menyetujui pengisian saldonya sendiri', async () => {
  const pelanggan = await masukSebagai('toko');

  const ajukan = await kirim('/api/topups', {
    method: 'POST',
    cookie: pelanggan,
    body: { nominal: 500000, catatanBukti: 'percaya saja' },
  });
  const { topup } = await ajukan.json();

  const setujui = await kirim(`/api/dapur/topups/${topup.id}/approve`, {
    method: 'POST',
    cookie: pelanggan,
  });

  assert.equal(setujui.status, 403);

  const saldo = await (await kirim('/api/balance', { cookie: pelanggan })).json();
  assert.equal(saldo.saldo, 0, 'saldo tidak boleh bertambah');
});

test('dapur melihat antrean pengisian saldo dan bisa menolaknya', async () => {
  const dapur = await masukSebagai('dapur');
  const pelanggan = await masukSebagai('toko');

  const ajukan = await kirim('/api/topups', {
    method: 'POST',
    cookie: pelanggan,
    body: { nominal: 150000, catatanBukti: 'bukti kabur' },
  });
  const { topup } = await ajukan.json();

  const antrean = await (await kirim('/api/dapur/topups', { cookie: dapur })).json();
  assert.equal(antrean.topup.length, 1);
  assert.equal(antrean.topup[0].nominal, 150000);

  const tolak = await kirim(`/api/dapur/topups/${topup.id}/reject`, {
    method: 'POST',
    cookie: dapur,
  });
  assert.equal(tolak.status, 200);
  assert.equal((await tolak.json()).status, 'rejected');

  const saldo = await (await kirim('/api/balance', { cookie: pelanggan })).json();
  assert.equal(saldo.saldo, 0);

  const daftarSaya = await (await kirim('/api/topups', { cookie: pelanggan })).json();
  assert.equal(daftarSaya.topup[0].status, 'rejected');
});

test('nominal isi saldo tidak valid dijawab 422', async () => {
  const pelanggan = await masukSebagai('toko');
  const res = await kirim('/api/topups', {
    method: 'POST',
    cookie: pelanggan,
    body: { nominal: -50000, catatanBukti: '' },
  });
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error.code, 'NOMINAL_TIDAK_VALID');
});

test('daftar pesanan saya hanya berisi milik sendiri', async () => {
  const dapur = await masukSebagai('dapur');
  const a = await masukSebagai('toko');
  const b = await masukSebagai('toko');
  const menuHarianId = await siapkanHari(dapur, 10);
  await isiSaldo(a, dapur, 200000);
  await isiSaldo(b, dapur, 200000);

  await kirim('/api/orders', {
    method: 'POST',
    cookie: a,
    body: { tanggal: TANGGAL, item: [{ dailyMenuItemId: menuHarianId, jumlah: 1 }] },
  });
  await kirim('/api/orders', {
    method: 'POST',
    cookie: b,
    body: { tanggal: TANGGAL, item: [{ dailyMenuItemId: menuHarianId, jumlah: 2 }] },
  });

  const punyaA = await (await kirim('/api/orders', { cookie: a })).json();
  assert.equal(punyaA.pesanan.length, 1);
  assert.equal(punyaA.pesanan[0].total, 32000);
});
