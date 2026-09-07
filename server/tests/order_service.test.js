import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pool, withTransaction } from '../src/db.js';
import { resetDatabase, panaskanPool } from './helper.js';
import { buatMenuItem, bukaTanggalLayanan, tutupTanggalLayanan } from '../src/services/menu.js';
import {
  buatPesanan,
  batalkanPesanan,
  lihatPesanan,
  lihatPesananSaya,
} from '../src/services/order.js';
import {
  KuotaHabis,
  SaldoTidakCukup,
  LewatBatasWaktu,
  JumlahTidakValid,
  ItemPesananKosong,
  ItemMenuTidakDitemukan,
  PesananTidakDitemukan,
  PesananSudahDibatalkan,
  TidakBerwenang,
} from '../src/errors.js';

after(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDatabase();
});

const TANGGAL = '2030-01-01';
const CUTOFF = '2029-12-31T20:00:00+07:00';
const HARGA = 32000;

/** Membuat user pelanggan sekaligus mengisi saldonya lewat buku besar. */
async function buatPelanggan(saldo = 0, alamat = 'Jl. Melati No. 12') {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, nama, alamat, saldo)
     VALUES ($1, 'h', 'Pelanggan', $2, 0) RETURNING id`,
    [`pesan-${Date.now()}-${Math.random()}@contoh.test`, alamat]
  );
  const userId = rows[0].id;

  if (saldo > 0) {
    await withTransaction(async (c) => {
      await c.query('UPDATE users SET saldo = saldo + $2 WHERE id = $1', [userId, saldo]);
      await c.query(
        `INSERT INTO credit_ledger (user_id, jumlah, jenis, catatan)
         VALUES ($1, $2, 'topup', 'saldo awal untuk uji')`,
        [userId, saldo]
      );
    });
  }
  return userId;
}

/** Membuka satu tanggal layanan berisi satu menu, lalu mengembalikan idnya. */
async function siapkanHari({ tanggal = TANGGAL, cutoff = CUTOFF, kuota = 10, harga = HARGA } = {}) {
  const menu = await buatMenuItem({ nama: `Katsu ${Math.random()}`, harga });
  const hari = await bukaTanggalLayanan({
    tanggal,
    batasWaktuPesan: cutoff,
    item: [{ menuItemId: menu.id, kuota, harga }],
  });
  return { menuId: menu.id, dailyMenuItemId: hari.item[0].id };
}

async function saldoDari(userId) {
  const { rows } = await pool.query('SELECT saldo FROM users WHERE id = $1', [userId]);
  return rows[0].saldo;
}

async function terjualDari(dailyMenuItemId) {
  const { rows } = await pool.query('SELECT terjual FROM daily_menu_items WHERE id = $1', [
    dailyMenuItemId,
  ]);
  return rows[0].terjual;
}

// ---------------------------------------------------------------------------
// Jalur normal
// ---------------------------------------------------------------------------

test('pesanan berhasil memotong saldo, menambah terjual, dan mencatat buku besar', async () => {
  const { dailyMenuItemId } = await siapkanHari({ kuota: 10 });
  const userId = await buatPelanggan(100000);

  const pesanan = await buatPesanan({
    userId,
    tanggal: TANGGAL,
    item: [{ dailyMenuItemId, jumlah: 2 }],
  });

  assert.equal(pesanan.status, 'confirmed');
  assert.equal(pesanan.tanggal, TANGGAL);
  assert.equal(pesanan.total, 64000);
  assert.equal(await saldoDari(userId), 36000);
  assert.equal(await terjualDari(dailyMenuItemId), 2);

  const { rows } = await pool.query(
    `SELECT jumlah, jenis, ref_order_id FROM credit_ledger WHERE user_id = $1 AND jenis = 'order'`,
    [userId]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].jumlah, -64000, 'pemotongan dicatat sebagai angka negatif');
  assert.equal(rows[0].ref_order_id, pesanan.id);
});

test('pesanan menyimpan alamat dan harga sebagai snapshot', async () => {
  const { dailyMenuItemId, menuId } = await siapkanHari();
  const userId = await buatPelanggan(100000, 'Jl. Kenanga No. 4');

  const pesanan = await buatPesanan({
    userId,
    tanggal: TANGGAL,
    item: [{ dailyMenuItemId, jumlah: 1 }],
  });

  assert.equal(pesanan.alamatAntar, 'Jl. Kenanga No. 4');

  // Setelah pesanan dibuat, alamat user dan harga katalog berubah.
  await pool.query('UPDATE users SET alamat = $2 WHERE id = $1', [userId, 'Alamat Baru']);
  await pool.query('UPDATE menu_items SET harga = 99000 WHERE id = $1', [menuId]);

  const dibaca = await lihatPesanan({ userId, orderId: pesanan.id });
  assert.equal(dibaca.alamatAntar, 'Jl. Kenanga No. 4', 'alamat lama harus tetap tercatat');
  assert.equal(dibaca.item[0].hargaSatuan, HARGA, 'harga lama harus tetap tercatat');
  assert.equal(dibaca.total, HARGA);
});

test('beberapa menu dalam satu pesanan dijumlahkan dengan benar', async () => {
  const menuA = await buatMenuItem({ nama: 'Menu A', harga: 30000 });
  const menuB = await buatMenuItem({ nama: 'Menu B', harga: 24000 });
  const hari = await bukaTanggalLayanan({
    tanggal: TANGGAL,
    batasWaktuPesan: CUTOFF,
    item: [
      { menuItemId: menuA.id, kuota: 10 },
      { menuItemId: menuB.id, kuota: 10 },
    ],
  });
  const [a, b] = hari.item;
  const userId = await buatPelanggan(200000);

  const pesanan = await buatPesanan({
    userId,
    tanggal: TANGGAL,
    item: [
      { dailyMenuItemId: a.id, jumlah: 2 },
      { dailyMenuItemId: b.id, jumlah: 1 },
    ],
  });

  assert.equal(pesanan.total, a.harga * 2 + b.harga * 1);
  assert.equal(await saldoDari(userId), 200000 - pesanan.total);
  assert.equal(await terjualDari(a.id), 2);
  assert.equal(await terjualDari(b.id), 1);
});

// ---------------------------------------------------------------------------
// Kuota
// ---------------------------------------------------------------------------

test('memesan melebihi sisa kuota ditolak dan tidak mengubah apa pun', async () => {
  const { dailyMenuItemId } = await siapkanHari({ kuota: 3 });
  const userId = await buatPelanggan(500000);

  await assert.rejects(
    () => buatPesanan({ userId, tanggal: TANGGAL, item: [{ dailyMenuItemId, jumlah: 4 }] }),
    KuotaHabis
  );

  assert.equal(await saldoDari(userId), 500000, 'saldo tidak boleh terpotong');
  assert.equal(await terjualDari(dailyMenuItemId), 0);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM orders');
  assert.equal(rows[0].n, 0, 'tidak boleh ada pesanan tersisa');
});

test('memesan tepat sebanyak sisa kuota diterima', async () => {
  const { dailyMenuItemId } = await siapkanHari({ kuota: 3 });
  const userId = await buatPelanggan(500000);

  await buatPesanan({ userId, tanggal: TANGGAL, item: [{ dailyMenuItemId, jumlah: 3 }] });
  assert.equal(await terjualDari(dailyMenuItemId), 3);

  await assert.rejects(
    () => buatPesanan({ userId, tanggal: TANGGAL, item: [{ dailyMenuItemId, jumlah: 1 }] }),
    KuotaHabis
  );
});

test('kuota habis pada menu kedua membatalkan seluruh pesanan', async () => {
  const menuA = await buatMenuItem({ nama: 'Menu A', harga: 30000 });
  const menuB = await buatMenuItem({ nama: 'Menu B', harga: 24000 });
  const hari = await bukaTanggalLayanan({
    tanggal: TANGGAL,
    batasWaktuPesan: CUTOFF,
    item: [
      { menuItemId: menuA.id, kuota: 10 },
      { menuItemId: menuB.id, kuota: 1 },
    ],
  });
  const [a, b] = hari.item;
  const userId = await buatPelanggan(200000);

  await assert.rejects(
    () =>
      buatPesanan({
        userId,
        tanggal: TANGGAL,
        item: [
          { dailyMenuItemId: a.id, jumlah: 2 },
          { dailyMenuItemId: b.id, jumlah: 5 },
        ],
      }),
    KuotaHabis
  );

  assert.equal(await terjualDari(a.id), 0, 'menu pertama pun harus ikut dibatalkan');
  assert.equal(await saldoDari(userId), 200000);
});

// ---------------------------------------------------------------------------
// Saldo
// ---------------------------------------------------------------------------

test('saldo kurang ditolak dan kuota tidak ikut terpakai', async () => {
  const { dailyMenuItemId } = await siapkanHari({ kuota: 10 });
  const userId = await buatPelanggan(31999);

  await assert.rejects(
    () => buatPesanan({ userId, tanggal: TANGGAL, item: [{ dailyMenuItemId, jumlah: 1 }] }),
    SaldoTidakCukup
  );

  assert.equal(await saldoDari(userId), 31999);
  assert.equal(await terjualDari(dailyMenuItemId), 0, 'kuota tidak boleh terpakai');
});

test('saldo tepat pas diterima dan sisa saldo jadi nol', async () => {
  const { dailyMenuItemId } = await siapkanHari();
  const userId = await buatPelanggan(HARGA);

  await buatPesanan({ userId, tanggal: TANGGAL, item: [{ dailyMenuItemId, jumlah: 1 }] });
  assert.equal(await saldoDari(userId), 0);
});

// ---------------------------------------------------------------------------
// Batas waktu dan status hari
// ---------------------------------------------------------------------------

test('memesan setelah batas waktu ditolak', async () => {
  const { dailyMenuItemId } = await siapkanHari({
    tanggal: '2020-06-01',
    cutoff: '2020-05-31T20:00:00+07:00',
  });
  const userId = await buatPelanggan(100000);

  await assert.rejects(
    () =>
      buatPesanan({ userId, tanggal: '2020-06-01', item: [{ dailyMenuItemId, jumlah: 1 }] }),
    LewatBatasWaktu
  );
  assert.equal(await terjualDari(dailyMenuItemId), 0);
});

test('memesan pada tanggal yang sudah ditutup dapur ditolak', async () => {
  const { dailyMenuItemId } = await siapkanHari();
  const userId = await buatPelanggan(100000);
  await tutupTanggalLayanan(TANGGAL);

  await assert.rejects(
    () => buatPesanan({ userId, tanggal: TANGGAL, item: [{ dailyMenuItemId, jumlah: 1 }] }),
    LewatBatasWaktu
  );
});

// ---------------------------------------------------------------------------
// Validasi masukan
// ---------------------------------------------------------------------------

test('jumlah tidak valid ditolak', async () => {
  const { dailyMenuItemId } = await siapkanHari();
  const userId = await buatPelanggan(100000);
  const coba = (jumlah) =>
    buatPesanan({ userId, tanggal: TANGGAL, item: [{ dailyMenuItemId, jumlah }] });

  await assert.rejects(() => coba(0), JumlahTidakValid);
  await assert.rejects(() => coba(-1), JumlahTidakValid);
  await assert.rejects(() => coba(1.5), JumlahTidakValid);
});

test('pesanan tanpa item ditolak', async () => {
  await siapkanHari();
  const userId = await buatPelanggan(100000);
  await assert.rejects(
    () => buatPesanan({ userId, tanggal: TANGGAL, item: [] }),
    ItemPesananKosong
  );
});

test('menu dari tanggal lain ditolak', async () => {
  const { dailyMenuItemId } = await siapkanHari({ tanggal: '2030-01-01' });
  await siapkanHari({ tanggal: '2030-01-02', cutoff: '2030-01-01T20:00:00+07:00' });
  const userId = await buatPelanggan(100000);

  await assert.rejects(
    () =>
      buatPesanan({ userId, tanggal: '2030-01-02', item: [{ dailyMenuItemId, jumlah: 1 }] }),
    ItemMenuTidakDitemukan
  );
});

// ---------------------------------------------------------------------------
// Kepemilikan (IDOR)
// ---------------------------------------------------------------------------

test('pelanggan lain tidak bisa membaca pesanan yang bukan miliknya', async () => {
  const { dailyMenuItemId } = await siapkanHari();
  const pemilik = await buatPelanggan(100000);
  const orangLain = await buatPelanggan(100000);

  const pesanan = await buatPesanan({
    userId: pemilik,
    tanggal: TANGGAL,
    item: [{ dailyMenuItemId, jumlah: 1 }],
  });

  await assert.rejects(
    () => lihatPesanan({ userId: orangLain, orderId: pesanan.id }),
    TidakBerwenang
  );
});

test('pelanggan lain tidak bisa membatalkan pesanan yang bukan miliknya', async () => {
  const { dailyMenuItemId } = await siapkanHari();
  const pemilik = await buatPelanggan(100000);
  const orangLain = await buatPelanggan(100000);

  const pesanan = await buatPesanan({
    userId: pemilik,
    tanggal: TANGGAL,
    item: [{ dailyMenuItemId, jumlah: 1 }],
  });

  await assert.rejects(
    () => batalkanPesanan({ userId: orangLain, orderId: pesanan.id }),
    TidakBerwenang
  );
  assert.equal(await terjualDari(dailyMenuItemId), 1, 'kuota tidak boleh ikut dikembalikan');
});

test('pesanan yang tidak ada menghasilkan 404, bukan 403', async () => {
  const userId = await buatPelanggan(100000);
  await assert.rejects(
    () => lihatPesanan({ userId, orderId: 999999 }),
    PesananTidakDitemukan
  );
});

test('daftar pesanan saya hanya berisi milik sendiri', async () => {
  const { dailyMenuItemId } = await siapkanHari({ kuota: 10 });
  const a = await buatPelanggan(200000);
  const b = await buatPelanggan(200000);

  await buatPesanan({ userId: a, tanggal: TANGGAL, item: [{ dailyMenuItemId, jumlah: 1 }] });
  await buatPesanan({ userId: a, tanggal: TANGGAL, item: [{ dailyMenuItemId, jumlah: 1 }] });
  await buatPesanan({ userId: b, tanggal: TANGGAL, item: [{ dailyMenuItemId, jumlah: 1 }] });

  const punyaA = await lihatPesananSaya(a);
  assert.equal(punyaA.length, 2);
  assert.ok(punyaA.every((p) => p.total === HARGA));
});

// ---------------------------------------------------------------------------
// Pembatalan
// ---------------------------------------------------------------------------

test('pembatalan mengembalikan saldo dan kuota', async () => {
  const { dailyMenuItemId } = await siapkanHari({ kuota: 10 });
  const userId = await buatPelanggan(100000);

  const pesanan = await buatPesanan({
    userId,
    tanggal: TANGGAL,
    item: [{ dailyMenuItemId, jumlah: 2 }],
  });
  assert.equal(await saldoDari(userId), 36000);

  await batalkanPesanan({ userId, orderId: pesanan.id });

  assert.equal(await saldoDari(userId), 100000, 'saldo harus kembali utuh');
  assert.equal(await terjualDari(dailyMenuItemId), 0, 'kuota harus kembali tersedia');

  const dibaca = await lihatPesanan({ userId, orderId: pesanan.id });
  assert.equal(dibaca.status, 'cancelled');
});

test('pembatalan dicatat di buku besar sebagai refund, bukan menghapus catatan lama', async () => {
  const { dailyMenuItemId } = await siapkanHari();
  const userId = await buatPelanggan(100000);
  const pesanan = await buatPesanan({
    userId,
    tanggal: TANGGAL,
    item: [{ dailyMenuItemId, jumlah: 1 }],
  });

  await batalkanPesanan({ userId, orderId: pesanan.id });

  const { rows } = await pool.query(
    `SELECT jenis, jumlah FROM credit_ledger WHERE user_id = $1 ORDER BY id`,
    [userId]
  );
  assert.deepEqual(
    rows.map((r) => r.jenis),
    ['topup', 'order', 'refund'],
    'catatan lama tidak boleh dihapus, hanya ditambah catatan baru'
  );
  assert.equal(rows[2].jumlah, HARGA);
});

test('pembatalan dua kali ditolak dan saldo tidak dobel', async () => {
  const { dailyMenuItemId } = await siapkanHari();
  const userId = await buatPelanggan(100000);
  const pesanan = await buatPesanan({
    userId,
    tanggal: TANGGAL,
    item: [{ dailyMenuItemId, jumlah: 1 }],
  });

  await batalkanPesanan({ userId, orderId: pesanan.id });
  await assert.rejects(
    () => batalkanPesanan({ userId, orderId: pesanan.id }),
    PesananSudahDibatalkan
  );

  assert.equal(await saldoDari(userId), 100000, 'saldo tidak boleh dikembalikan dua kali');
});

test('pembatalan setelah batas waktu ditolak', async () => {
  // Dibuat saat masih boleh, lalu harinya ditutup dapur.
  const { dailyMenuItemId } = await siapkanHari();
  const userId = await buatPelanggan(100000);
  const pesanan = await buatPesanan({
    userId,
    tanggal: TANGGAL,
    item: [{ dailyMenuItemId, jumlah: 1 }],
  });

  await tutupTanggalLayanan(TANGGAL);

  await assert.rejects(
    () => batalkanPesanan({ userId, orderId: pesanan.id }),
    LewatBatasWaktu
  );
  assert.equal(await saldoDari(userId), 100000 - HARGA, 'saldo tidak boleh kembali');
});

test('kuota yang dikembalikan bisa dipesan orang lain', async () => {
  const { dailyMenuItemId } = await siapkanHari({ kuota: 1 });
  const a = await buatPelanggan(100000);
  const b = await buatPelanggan(100000);

  const pesanan = await buatPesanan({
    userId: a,
    tanggal: TANGGAL,
    item: [{ dailyMenuItemId, jumlah: 1 }],
  });
  await assert.rejects(
    () => buatPesanan({ userId: b, tanggal: TANGGAL, item: [{ dailyMenuItemId, jumlah: 1 }] }),
    KuotaHabis
  );

  await batalkanPesanan({ userId: a, orderId: pesanan.id });

  const pesananB = await buatPesanan({
    userId: b,
    tanggal: TANGGAL,
    item: [{ dailyMenuItemId, jumlah: 1 }],
  });
  assert.equal(pesananB.status, 'confirmed');
});

// ---------------------------------------------------------------------------
// Buku besar seimbang
// ---------------------------------------------------------------------------

test('jumlah buku besar selalu sama dengan kolom saldo', async () => {
  const { dailyMenuItemId } = await siapkanHari({ kuota: 10 });
  const userId = await buatPelanggan(100000);

  const p1 = await buatPesanan({
    userId,
    tanggal: TANGGAL,
    item: [{ dailyMenuItemId, jumlah: 2 }],
  });
  await buatPesanan({ userId, tanggal: TANGGAL, item: [{ dailyMenuItemId, jumlah: 1 }] });
  await batalkanPesanan({ userId, orderId: p1.id });

  const { rows } = await pool.query(
    // SUM() atas BIGINT menghasilkan NUMERIC di PostgreSQL supaya penjumlahan
    // besar tidak meluap. NUMERIC kembali sebagai string, jadi dicast balik ke
    // BIGINT agar sebanding dengan kolom saldo.
    `SELECT u.saldo, COALESCE(SUM(l.jumlah), 0)::bigint AS total_buku
     FROM users u LEFT JOIN credit_ledger l ON l.user_id = u.id
     WHERE u.id = $1 GROUP BY u.saldo`,
    [userId]
  );
  assert.equal(rows[0].saldo, rows[0].total_buku);
});

// ---------------------------------------------------------------------------
// INI YANG PALING PENTING: race condition
// ---------------------------------------------------------------------------

test('20 pemesanan bersamaan untuk 1 porsi terakhir: tepat 1 berhasil', async () => {
  const { dailyMenuItemId } = await siapkanHari({ kuota: 1 });

  const pelanggan = [];
  for (let i = 0; i < 20; i++) pelanggan.push(await buatPelanggan(100000));

  await panaskanPool();

  const hasil = await Promise.allSettled(
    pelanggan.map((userId) =>
      buatPesanan({ userId, tanggal: TANGGAL, item: [{ dailyMenuItemId, jumlah: 1 }] })
    )
  );

  const berhasil = hasil.filter((h) => h.status === 'fulfilled');
  const gagal = hasil.filter((h) => h.status === 'rejected');

  assert.equal(berhasil.length, 1, `harus tepat 1 yang berhasil, dapat ${berhasil.length}`);
  assert.equal(gagal.length, 19);
  assert.ok(
    gagal.every((g) => g.reason instanceof KuotaHabis),
    `semua kegagalan harus KuotaHabis, dapat: ${[...new Set(gagal.map((g) => g.reason?.constructor?.name))].join(', ')}`
  );

  assert.equal(await terjualDari(dailyMenuItemId), 1, 'terjual tidak boleh melebihi kuota');

  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM orders`);
  assert.equal(rows[0].n, 1, 'hanya boleh ada satu pesanan yang tersimpan');

  // 19 pelanggan yang gagal tidak boleh kehilangan uang sepeser pun.
  const saldo = await pool.query(
    `SELECT COUNT(*)::int AS n FROM users WHERE saldo = 100000 AND peran = 'customer'`
  );
  assert.equal(saldo.rows[0].n, 19);
});

test('5 pemesanan bersamaan dari satu orang yang saldonya cuma cukup 1: tepat 1 berhasil', async () => {
  const { dailyMenuItemId } = await siapkanHari({ kuota: 100 });
  const userId = await buatPelanggan(HARGA);

  await panaskanPool();

  const hasil = await Promise.allSettled(
    Array.from({ length: 5 }, () =>
      buatPesanan({ userId, tanggal: TANGGAL, item: [{ dailyMenuItemId, jumlah: 1 }] })
    )
  );

  const berhasil = hasil.filter((h) => h.status === 'fulfilled');
  assert.equal(berhasil.length, 1, 'saldo tidak boleh dipakai lebih dari sekali');
  assert.ok(hasil.filter((h) => h.status === 'rejected').every((g) => g.reason instanceof SaldoTidakCukup));

  assert.equal(await saldoDari(userId), 0);
  assert.equal(await terjualDari(dailyMenuItemId), 1);
});
