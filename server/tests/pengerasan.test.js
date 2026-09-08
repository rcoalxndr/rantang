import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { resetDatabase, panaskanPool } from './helper.js';
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
      ...(opsi.headers ?? {}),
    },
    body: opsi.body ? JSON.stringify(opsi.body) : undefined,
  });
}

const ambilCookie = (res) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');

async function masukSebagai(peran, email = `${peran}-${Date.now()}-${Math.random()}@contoh.test`) {
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
  return { cookie: ambilCookie(login), email };
}

// ---------------------------------------------------------------------------
// Pembatasan laju
// ---------------------------------------------------------------------------

test('percobaan masuk yang gagal berulang akhirnya dijawab 429', async () => {
  const email = 'korban@contoh.test';
  await kirim('/api/auth/register', {
    method: 'POST',
    body: { email, kataSandi: 'kata-sandi-benar', nama: 'Korban', alamat: 'Jl. A' },
  });

  const status = [];
  for (let i = 0; i < 12; i++) {
    const res = await kirim('/api/auth/login', {
      method: 'POST',
      body: { email, kataSandi: 'tebakan-salah' },
    });
    status.push(res.status);
  }

  assert.ok(status.includes(401), 'percobaan awal harus dijawab 401, bukan langsung diblokir');
  assert.ok(status.includes(429), 'setelah beberapa percobaan harus diblokir 429');
  assert.equal(status.at(-1), 429);
});

test('pemblokiran berlaku per email, bukan menghantam semua orang', async () => {
  const a = 'satu@contoh.test';
  const b = 'dua@contoh.test';
  for (const email of [a, b]) {
    await kirim('/api/auth/register', {
      method: 'POST',
      body: { email, kataSandi: 'kata-sandi-benar', nama: 'Uji', alamat: 'Jl. A' },
    });
  }

  for (let i = 0; i < 12; i++) {
    await kirim('/api/auth/login', { method: 'POST', body: { email: a, kataSandi: 'salah' } });
  }

  const terblokir = await kirim('/api/auth/login', {
    method: 'POST',
    body: { email: a, kataSandi: 'kata-sandi-benar' },
  });
  assert.equal(terblokir.status, 429, 'akun yang diserang memang diblokir sementara');

  const bebas = await kirim('/api/auth/login', {
    method: 'POST',
    body: { email: b, kataSandi: 'kata-sandi-benar' },
  });
  assert.equal(bebas.status, 200, 'akun lain tidak boleh ikut terkunci');
});

test('login yang berhasil menghapus penghitung percobaan', async () => {
  const email = 'pemilik@contoh.test';
  await kirim('/api/auth/register', {
    method: 'POST',
    body: { email, kataSandi: 'kata-sandi-benar', nama: 'Pemilik', alamat: 'Jl. A' },
  });

  for (let i = 0; i < 5; i++) {
    await kirim('/api/auth/login', { method: 'POST', body: { email, kataSandi: 'salah' } });
  }

  const berhasil = await kirim('/api/auth/login', {
    method: 'POST',
    body: { email, kataSandi: 'kata-sandi-benar' },
  });
  assert.equal(berhasil.status, 200);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM pembatasan_laju WHERE kunci = $1', [
    `masuk:${email}`,
  ]);
  assert.equal(rows[0].n, 0, 'penghitung harus dilupakan setelah pemilik sah berhasil masuk');
});

test('pendaftaran massal dari satu alamat dibatasi', async () => {
  const status = [];
  for (let i = 0; i < 14; i++) {
    const res = await kirim('/api/auth/register', {
      method: 'POST',
      body: {
        email: `spam-${i}@contoh.test`,
        kataSandi: 'kata-sandi-aman',
        nama: 'Spam',
        alamat: 'Jl. A',
      },
    });
    status.push(res.status);
  }
  assert.ok(status.includes(201), 'pendaftaran awal harus berhasil');
  assert.equal(status.at(-1), 429, 'pendaftaran berlebihan harus diblokir');
});

// ---------------------------------------------------------------------------
// Idempotensi
// ---------------------------------------------------------------------------

const TANGGAL = '2030-01-01';
const CUTOFF = '2029-12-31T20:00:00+07:00';

async function siapkanPesanan() {
  const dapur = await masukSebagai('dapur');
  const toko = await masukSebagai('toko');

  const { item: menu } = await (
    await kirim('/api/dapur/menu-items', {
      method: 'POST',
      cookie: dapur.cookie,
      body: { nama: `Katsu ${Math.random()}`, harga: 32000 },
    })
  ).json();

  const hari = await (
    await kirim('/api/dapur/service-days', {
      method: 'POST',
      cookie: dapur.cookie,
      body: { tanggal: TANGGAL, batasWaktuPesan: CUTOFF, item: [{ menuItemId: menu.id, kuota: 50 }] },
    })
  ).json();

  const { topup } = await (
    await kirim('/api/topups', {
      method: 'POST',
      cookie: toko.cookie,
      body: { nominal: 500000, catatanBukti: 'uji' },
    })
  ).json();
  await kirim(`/api/dapur/topups/${topup.id}/approve`, { method: 'POST', cookie: dapur.cookie });

  return { toko, dapur, menuHarianId: hari.item[0].id };
}

test('kunci yang sama dipakai dua kali hanya menghasilkan satu pesanan', async () => {
  const { toko, menuHarianId } = await siapkanPesanan();
  const kunci = `uji-${Date.now()}-${Math.random()}`;
  const isi = { tanggal: TANGGAL, item: [{ dailyMenuItemId: menuHarianId, jumlah: 2 }] };

  const a = await kirim('/api/orders', {
    method: 'POST',
    cookie: toko.cookie,
    headers: { 'Idempotency-Key': kunci },
    body: isi,
  });
  const b = await kirim('/api/orders', {
    method: 'POST',
    cookie: toko.cookie,
    headers: { 'Idempotency-Key': kunci },
    body: isi,
  });

  assert.equal(a.status, 201);
  assert.ok([200, 201].includes(b.status));

  const p1 = (await a.json()).pesanan;
  const p2 = (await b.json()).pesanan;
  assert.equal(p1.id, p2.id, 'kedua permintaan harus menunjuk pesanan yang sama');

  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM orders');
  assert.equal(rows[0].n, 1, 'hanya boleh ada satu pesanan tersimpan');

  const saldo = await (await kirim('/api/balance', { cookie: toko.cookie })).json();
  assert.equal(saldo.saldo, 500000 - 64000, 'deposit hanya boleh terpotong sekali');
});

test('klik ganda benar-benar bersamaan tetap menghasilkan satu pesanan', async () => {
  const { toko, menuHarianId } = await siapkanPesanan();
  const kunci = `uji-serentak-${Date.now()}-${Math.random()}`;
  const isi = { tanggal: TANGGAL, item: [{ dailyMenuItemId: menuHarianId, jumlah: 1 }] };

  await panaskanPool();

  const hasil = await Promise.all(
    Array.from({ length: 5 }, () =>
      kirim('/api/orders', {
        method: 'POST',
        cookie: toko.cookie,
        headers: { 'Idempotency-Key': kunci },
        body: isi,
      })
    )
  );

  const isiRespons = await Promise.all(hasil.map((r) => r.json()));
  const idPesanan = new Set(isiRespons.map((d) => d.pesanan?.id).filter(Boolean));

  assert.equal(idPesanan.size, 1, `harus menunjuk satu pesanan, dapat ${idPesanan.size}`);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM orders');
  assert.equal(rows[0].n, 1);

  const saldo = await (await kirim('/api/balance', { cookie: toko.cookie })).json();
  assert.equal(saldo.saldo, 500000 - 32000, 'deposit hanya terpotong sekali');
});

test('tanpa kunci, dua permintaan tetap jadi dua pesanan', async () => {
  const { toko, menuHarianId } = await siapkanPesanan();
  const isi = { tanggal: TANGGAL, item: [{ dailyMenuItemId: menuHarianId, jumlah: 1 }] };

  await kirim('/api/orders', { method: 'POST', cookie: toko.cookie, body: isi });
  await kirim('/api/orders', { method: 'POST', cookie: toko.cookie, body: isi });

  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM orders');
  assert.equal(rows[0].n, 2, 'idempotensi hanya berlaku kalau klien memintanya');
});

test('kunci milik toko lain ditolak', async () => {
  const { toko, menuHarianId } = await siapkanPesanan();
  const lain = await masukSebagai('toko');
  const kunci = `uji-curi-${Date.now()}-${Math.random()}`;
  const isi = { tanggal: TANGGAL, item: [{ dailyMenuItemId: menuHarianId, jumlah: 1 }] };

  await kirim('/api/orders', {
    method: 'POST',
    cookie: toko.cookie,
    headers: { 'Idempotency-Key': kunci },
    body: isi,
  });

  const res = await kirim('/api/orders', {
    method: 'POST',
    cookie: lain.cookie,
    headers: { 'Idempotency-Key': kunci },
    body: isi,
  });

  assert.equal(res.status, 409);
  assert.equal((await res.json()).error.code, 'KUNCI_IDEMPOTENSI_DIPAKAI_ULANG');
});
