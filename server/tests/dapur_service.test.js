import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pool, withTransaction } from '../src/db.js';
import { resetDatabase } from './helper.js';
import { buatMenuItem, bukaTanggalLayanan } from '../src/services/menu.js';
import { buatPesanan, batalkanPesanan } from '../src/services/order.js';
import { daftarProduksi, daftarAntar, tandaiTerkirim } from '../src/services/dapur.js';
import {
  TanggalLayananTidakDitemukan,
  TanggalTidakValid,
  PesananTidakDitemukan,
  PesananSudahDibatalkan,
  PesananSudahDikirim,
} from '../src/errors.js';

after(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDatabase();
});

const TANGGAL = '2030-01-01';
const CUTOFF = '2029-12-31T20:00:00+07:00';

async function buatPelanggan({ saldo = 500000, nama = 'Pelanggan', alamat, telepon = '08123' }) {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, nama, telepon, alamat, saldo)
     VALUES ($1, 'h', $2, $3, $4, 0) RETURNING id`,
    [`dapur-${Date.now()}-${Math.random()}@contoh.test`, nama, telepon, alamat]
  );
  const userId = rows[0].id;
  await withTransaction(async (c) => {
    await c.query('UPDATE users SET saldo = saldo + $2 WHERE id = $1', [userId, saldo]);
    await c.query(
      `INSERT INTO credit_ledger (user_id, jumlah, jenis, catatan)
       VALUES ($1, $2, 'topup', 'saldo awal uji')`,
      [userId, saldo]
    );
  });
  return userId;
}

/** Membuka satu tanggal berisi dua menu. */
async function siapkanDuaMenu() {
  const katsu = await buatMenuItem({ nama: 'Katsu Ayam Saus Rendang', harga: 32000 });
  const ayam = await buatMenuItem({ nama: 'Ayam Bakar Bumbu Bali', harga: 30000 });
  const hari = await bukaTanggalLayanan({
    tanggal: TANGGAL,
    batasWaktuPesan: CUTOFF,
    item: [
      { menuItemId: katsu.id, kuota: 50 },
      { menuItemId: ayam.id, kuota: 40 },
    ],
  });
  // bukaTanggalLayanan mengembalikan item terurut nama: Ayam dulu, baru Katsu.
  const ayamHarian = hari.item.find((i) => i.nama.startsWith('Ayam'));
  const katsuHarian = hari.item.find((i) => i.nama.startsWith('Katsu'));
  return { ayamId: ayamHarian.id, katsuId: katsuHarian.id };
}

// ---------------------------------------------------------------------------
// Daftar produksi
// ---------------------------------------------------------------------------

test('daftar produksi menjumlahkan porsi dari semua pelanggan', async () => {
  const { ayamId, katsuId } = await siapkanDuaMenu();
  const a = await buatPelanggan({ alamat: 'Jl. A' });
  const b = await buatPelanggan({ alamat: 'Jl. B' });

  await buatPesanan({
    userId: a,
    tanggal: TANGGAL,
    item: [
      { dailyMenuItemId: katsuId, jumlah: 3 },
      { dailyMenuItemId: ayamId, jumlah: 1 },
    ],
  });
  await buatPesanan({ userId: b, tanggal: TANGGAL, item: [{ dailyMenuItemId: katsuId, jumlah: 2 }] });

  const produksi = await daftarProduksi(TANGGAL);

  assert.equal(produksi.tanggal, TANGGAL);
  assert.equal(produksi.totalPorsi, 6);

  const katsu = produksi.item.find((i) => i.nama.startsWith('Katsu'));
  const ayam = produksi.item.find((i) => i.nama.startsWith('Ayam'));
  assert.equal(katsu.jumlah, 5);
  assert.equal(ayam.jumlah, 1);
  assert.equal(katsu.kuota, 50);
});

test('menu yang belum dipesan tetap muncul dengan jumlah nol', async () => {
  const { katsuId } = await siapkanDuaMenu();
  const a = await buatPelanggan({ alamat: 'Jl. A' });
  await buatPesanan({ userId: a, tanggal: TANGGAL, item: [{ dailyMenuItemId: katsuId, jumlah: 1 }] });

  const produksi = await daftarProduksi(TANGGAL);

  assert.equal(produksi.item.length, 2, 'dua menu tetap terdaftar');
  const ayam = produksi.item.find((i) => i.nama.startsWith('Ayam'));
  assert.equal(ayam.jumlah, 0);
});

test('pesanan yang dibatalkan tidak ikut dimasak', async () => {
  const { katsuId } = await siapkanDuaMenu();
  const a = await buatPelanggan({ alamat: 'Jl. A' });
  const b = await buatPelanggan({ alamat: 'Jl. B' });

  const dibatalkan = await buatPesanan({
    userId: a,
    tanggal: TANGGAL,
    item: [{ dailyMenuItemId: katsuId, jumlah: 4 }],
  });
  await buatPesanan({ userId: b, tanggal: TANGGAL, item: [{ dailyMenuItemId: katsuId, jumlah: 2 }] });

  await batalkanPesanan({ userId: a, orderId: dibatalkan.id });

  const produksi = await daftarProduksi(TANGGAL);
  const katsu = produksi.item.find((i) => i.nama.startsWith('Katsu'));
  assert.equal(katsu.jumlah, 2);
  assert.equal(produksi.totalPorsi, 2);
});

test('jumlah produksi selalu sama dengan kolom terjual', async () => {
  const { ayamId, katsuId } = await siapkanDuaMenu();
  const a = await buatPelanggan({ alamat: 'Jl. A' });
  const b = await buatPelanggan({ alamat: 'Jl. B' });

  const p1 = await buatPesanan({
    userId: a,
    tanggal: TANGGAL,
    item: [
      { dailyMenuItemId: katsuId, jumlah: 3 },
      { dailyMenuItemId: ayamId, jumlah: 2 },
    ],
  });
  await buatPesanan({ userId: b, tanggal: TANGGAL, item: [{ dailyMenuItemId: katsuId, jumlah: 1 }] });
  await batalkanPesanan({ userId: a, orderId: p1.id });
  await buatPesanan({ userId: a, tanggal: TANGGAL, item: [{ dailyMenuItemId: ayamId, jumlah: 5 }] });

  const produksi = await daftarProduksi(TANGGAL);

  for (const i of produksi.item) {
    assert.equal(
      i.jumlah,
      i.terjual,
      `${i.nama}: dihitung dari pesanan = ${i.jumlah}, kolom terjual = ${i.terjual}`
    );
  }
});

test('tanggal yang belum dibuka menghasilkan 404', async () => {
  await assert.rejects(() => daftarProduksi('2030-06-06'), TanggalLayananTidakDitemukan);
});

test('tanggal tidak berformat ditolak', async () => {
  await assert.rejects(() => daftarProduksi('besok'), TanggalTidakValid);
});

// ---------------------------------------------------------------------------
// Daftar antar
// ---------------------------------------------------------------------------

test('daftar antar memuat alamat, telepon, dan isi tiap pesanan', async () => {
  const { ayamId, katsuId } = await siapkanDuaMenu();
  const a = await buatPelanggan({ nama: 'Rico', alamat: 'Jl. Melati No. 12', telepon: '0811' });
  const b = await buatPelanggan({ nama: 'Sinta', alamat: 'Jl. Kenanga No. 4', telepon: '0822' });

  await buatPesanan({
    userId: a,
    tanggal: TANGGAL,
    item: [
      { dailyMenuItemId: katsuId, jumlah: 2 },
      { dailyMenuItemId: ayamId, jumlah: 1 },
    ],
  });
  await buatPesanan({ userId: b, tanggal: TANGGAL, item: [{ dailyMenuItemId: ayamId, jumlah: 1 }] });

  const antar = await daftarAntar(TANGGAL);

  assert.equal(antar.totalPesanan, 2);

  const rico = antar.pesanan.find((p) => p.nama === 'Rico');
  assert.equal(rico.alamatAntar, 'Jl. Melati No. 12');
  assert.equal(rico.telepon, '0811');
  assert.equal(rico.total, 32000 * 2 + 30000);
  assert.equal(rico.item.length, 2);
  assert.equal(rico.item.reduce((n, i) => n + i.jumlah, 0), 3);
});

test('pesanan batal tidak muncul di daftar antar', async () => {
  const { katsuId } = await siapkanDuaMenu();
  const a = await buatPelanggan({ nama: 'Rico', alamat: 'Jl. A' });

  const pesanan = await buatPesanan({
    userId: a,
    tanggal: TANGGAL,
    item: [{ dailyMenuItemId: katsuId, jumlah: 1 }],
  });
  await batalkanPesanan({ userId: a, orderId: pesanan.id });

  const antar = await daftarAntar(TANGGAL);
  assert.equal(antar.totalPesanan, 0);
  assert.deepEqual(antar.pesanan, []);
});

test('alamat antar memakai alamat saat memesan, bukan alamat sekarang', async () => {
  const { katsuId } = await siapkanDuaMenu();
  const a = await buatPelanggan({ nama: 'Rico', alamat: 'Jl. Lama No. 1' });

  await buatPesanan({ userId: a, tanggal: TANGGAL, item: [{ dailyMenuItemId: katsuId, jumlah: 1 }] });
  await pool.query('UPDATE users SET alamat = $2 WHERE id = $1', [a, 'Jl. Baru No. 9']);

  const antar = await daftarAntar(TANGGAL);
  assert.equal(antar.pesanan[0].alamatAntar, 'Jl. Lama No. 1');
});

test('tanggal tanpa pesanan menghasilkan daftar kosong, bukan error', async () => {
  await siapkanDuaMenu();
  const antar = await daftarAntar(TANGGAL);
  assert.equal(antar.totalPesanan, 0);

  const produksi = await daftarProduksi(TANGGAL);
  assert.equal(produksi.totalPorsi, 0);
});

// ---------------------------------------------------------------------------
// Tandai terkirim
// ---------------------------------------------------------------------------

test('pesanan bisa ditandai terkirim dan tetap dihitung di produksi', async () => {
  const { katsuId } = await siapkanDuaMenu();
  const a = await buatPelanggan({ alamat: 'Jl. A' });
  const pesanan = await buatPesanan({
    userId: a,
    tanggal: TANGGAL,
    item: [{ dailyMenuItemId: katsuId, jumlah: 3 }],
  });

  const hasil = await tandaiTerkirim(pesanan.id);
  assert.equal(hasil.status, 'delivered');

  const produksi = await daftarProduksi(TANGGAL);
  assert.equal(produksi.totalPorsi, 3, 'porsi yang sudah diantar tetap terhitung sudah dimasak');

  const antar = await daftarAntar(TANGGAL);
  assert.equal(antar.pesanan[0].status, 'delivered');
});

test('menandai terkirim dua kali ditolak', async () => {
  const { katsuId } = await siapkanDuaMenu();
  const a = await buatPelanggan({ alamat: 'Jl. A' });
  const pesanan = await buatPesanan({
    userId: a,
    tanggal: TANGGAL,
    item: [{ dailyMenuItemId: katsuId, jumlah: 1 }],
  });

  await tandaiTerkirim(pesanan.id);
  await assert.rejects(() => tandaiTerkirim(pesanan.id), PesananSudahDikirim);
});

test('pesanan batal tidak bisa ditandai terkirim', async () => {
  const { katsuId } = await siapkanDuaMenu();
  const a = await buatPelanggan({ alamat: 'Jl. A' });
  const pesanan = await buatPesanan({
    userId: a,
    tanggal: TANGGAL,
    item: [{ dailyMenuItemId: katsuId, jumlah: 1 }],
  });
  await batalkanPesanan({ userId: a, orderId: pesanan.id });

  await assert.rejects(() => tandaiTerkirim(pesanan.id), PesananSudahDibatalkan);
});

test('pesanan yang tidak ada menghasilkan 404', async () => {
  await assert.rejects(() => tandaiTerkirim(999999), PesananTidakDitemukan);
});
