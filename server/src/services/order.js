import { pool, withTransaction } from '../db.js';
import {
  ItemPesananKosong,
  JumlahTidakValid,
  TanggalLayananTidakDitemukan,
  LewatBatasWaktu,
  ItemMenuTidakDitemukan,
  KuotaHabis,
  SaldoTidakCukup,
  PesananTidakDitemukan,
  PesananSudahDibatalkan,
  PesananSudahDikirim,
  TidakBerwenang,
  KunciIdempotensiDipakaiUlang,
} from '../errors.js';

/**
 * URUTAN PENGUNCIAN — aturan yang mengikat seluruh berkas ini.
 *
 *   1. users
 *   2. orders
 *   3. daily_menu_items, urut id menaik
 *
 * Setiap jalur kode yang mengunci lebih dari satu baris HARUS memakai urutan
 * ini, termasuk pembatalan. Kalau satu jalur mengunci A lalu B sementara jalur
 * lain mengunci B lalu A, keduanya bisa saling menunggu selamanya — deadlock.
 *
 * Baris daily_menu_items sengaja ditaruh paling akhir karena itu baris panas:
 * semua pemesan menu yang sama di tanggal yang sama memperebutkannya. Kunci di
 * situ harus dipegang sesingkat mungkin.
 */

function validasiItem(item) {
  if (!Array.isArray(item) || item.length === 0) throw new ItemPesananKosong();
  for (const baris of item) {
    if (!Number.isInteger(baris?.jumlah) || baris.jumlah <= 0) throw new JumlahTidakValid();
  }
}

/** Menolak kalau tanggalnya belum dibuka, sudah ditutup, atau sudah lewat batas. */
async function gerbangWaktu(c, tanggal) {
  const { rows } = await c.query(
    `SELECT (status = 'open' AND now() < batas_waktu_pesan) AS boleh
     FROM service_days WHERE tanggal = $1::date`,
    [tanggal]
  );
  if (rows.length === 0) throw new TanggalLayananTidakDitemukan();
  if (!rows[0].boleh) throw new LewatBatasWaktu();
}

async function bacaPesanan(klien, orderId) {
  const { rows } = await klien.query(
    `SELECT id, user_id, to_char(tanggal_layanan, 'YYYY-MM-DD') AS tanggal,
            status, total, alamat_antar
     FROM orders WHERE id = $1`,
    [orderId]
  );
  if (rows.length === 0) return null;

  const { rows: item } = await klien.query(
    `SELECT oi.daily_menu_item_id, m.nama, oi.jumlah, oi.harga_satuan,
            (oi.jumlah * oi.harga_satuan) AS subtotal
     FROM order_items oi
     JOIN daily_menu_items d ON d.id = oi.daily_menu_item_id
     JOIN menu_items m       ON m.id = d.menu_item_id
     WHERE oi.order_id = $1
     ORDER BY oi.id`,
    [orderId]
  );

  return {
    id: rows[0].id,
    userId: rows[0].user_id,
    tanggal: rows[0].tanggal,
    status: rows[0].status,
    total: rows[0].total,
    alamatAntar: rows[0].alamat_antar,
    item: item.map((r) => ({
      dailyMenuItemId: r.daily_menu_item_id,
      nama: r.nama,
      jumlah: r.jumlah,
      hargaSatuan: r.harga_satuan,
      subtotal: r.subtotal,
    })),
  };
}

function tanpaUserId(pesanan) {
  const { userId, ...sisanya } = pesanan;
  return sisanya;
}

export async function buatPesanan({ userId, tanggal, item, kunciIdempotensi = null }) {
  validasiItem(item);

  // Kalau klien mengirim kunci dan kunci itu sudah pernah dipakai, kembalikan
  // pesanan yang SAMA alih-alih membuat yang baru. Ini yang membuat klik ganda,
  // tombol yang ditekan dua kali, atau jaringan yang mengulang permintaan tidak
  // berubah jadi dua pesanan dengan dua potongan deposit.
  if (kunciIdempotensi) {
    const sudah = await bacaKunci(pool, kunciIdempotensi);
    if (sudah) {
      if (Number(sudah.user_id) !== Number(userId)) throw new KunciIdempotensiDipakaiUlang();
      if (sudah.order_id) return tanpaUserId(await bacaPesanan(pool, sudah.order_id));
    }
  }

  const pesanan = await withTransaction(async (c) => {
    // Kunci disisipkan DI DALAM transaksi. Kalau dua permintaan kembar tiba
    // bersamaan, yang kedua ditolak oleh batasan PRIMARY KEY — pola yang sama
    // dengan email ganda di services/user.js: biarkan database yang memutuskan,
    // jangan memeriksa lebih dulu lalu menulis.
    if (kunciIdempotensi) {
      try {
        await c.query(
          'INSERT INTO kunci_idempotensi (kunci, user_id) VALUES ($1, $2)',
          [kunciIdempotensi, userId]
        );
      } catch (err) {
        if (err.code === '23505') throw new PermintaanKembar();
        throw err;
      }
    }

    await gerbangWaktu(c, tanggal);

    // Harga diambil dari daily_menu_items, BUKAN dari menu_items. Yang berlaku
    // adalah harga yang dikunci untuk tanggal itu; perubahan harga katalog
    // sesudahnya tidak boleh mengubah apa pun.
    //
    // Syarat `tanggal` di sini juga yang menolak menu milik tanggal lain:
    // barisnya tidak ikut terambil, jumlahnya jadi kurang, dan pesanannya
    // ditolak — tanpa perlu pemeriksaan terpisah.
    const idItem = item.map((b) => b.dailyMenuItemId);
    const { rows: tersedia } = await c.query(
      `SELECT d.id, d.harga
       FROM daily_menu_items d
       WHERE d.id = ANY($1::bigint[]) AND d.tanggal = $2::date`,
      [idItem, tanggal]
    );

    const peta = new Map(tersedia.map((r) => [Number(r.id), r.harga]));
    for (const baris of item) {
      if (!peta.has(Number(baris.dailyMenuItemId))) throw new ItemMenuTidakDitemukan();
    }

    const total = item.reduce(
      (jumlah, baris) => jumlah + peta.get(Number(baris.dailyMenuItemId)) * baris.jumlah,
      0
    );

    // (1) users — pemeriksaan dan penulisan dalam satu pernyataan.
    // Tidak ada celah antara "saldonya cukup?" dan "potong saldo": syaratnya
    // ada di WHERE, dan yang diperiksa adalah berapa baris yang berubah.
    const potong = await c.query(
      `UPDATE users
       SET saldo = saldo - $2
       WHERE id = $1 AND saldo >= $2
       RETURNING alamat`,
      [userId, total]
    );
    if (potong.rowCount === 0) throw new SaldoTidakCukup();

    // (2) orders — alamat disalin sebagai snapshot, bukan direferensikan.
    const { rows: dibuat } = await c.query(
      `INSERT INTO orders (user_id, tanggal_layanan, total, alamat_antar)
       VALUES ($1, $2::date, $3, $4)
       RETURNING id`,
      [userId, tanggal, total, potong.rows[0].alamat]
    );
    const orderId = dibuat[0].id;

    for (const baris of item) {
      await c.query(
        `INSERT INTO order_items (order_id, daily_menu_item_id, jumlah, harga_satuan)
         VALUES ($1, $2, $3, $4)`,
        [orderId, baris.dailyMenuItemId, baris.jumlah, peta.get(Number(baris.dailyMenuItemId))]
      );
    }

    // (3) daily_menu_items — baris panas, diklaim paling akhir, urut id menaik.
    const urut = [...item].sort(
      (a, b) => Number(a.dailyMenuItemId) - Number(b.dailyMenuItemId)
    );
    for (const baris of urut) {
      const klaim = await c.query(
        `UPDATE daily_menu_items
         SET terjual = terjual + $2
         WHERE id = $1 AND terjual + $2 <= kuota
         RETURNING terjual`,
        [baris.dailyMenuItemId, baris.jumlah]
      );
      if (klaim.rowCount === 0) throw new KuotaHabis();
    }

    await c.query(
      `INSERT INTO credit_ledger (user_id, jumlah, jenis, ref_order_id, catatan)
       VALUES ($1, $2, 'order', $3, $4)`,
      [userId, -total, orderId, `pesanan #${orderId}`]
    );

    if (kunciIdempotensi) {
      await c.query('UPDATE kunci_idempotensi SET order_id = $2 WHERE kunci = $1', [
        kunciIdempotensi,
        orderId,
      ]);
    }

    return bacaPesanan(c, orderId);
  });

  return tanpaUserId(pesanan);
}

/** Membaca catatan kunci idempotensi, null kalau belum pernah dipakai. */
async function bacaKunci(klien, kunci) {
  const { rows } = await klien.query(
    'SELECT kunci, user_id, order_id FROM kunci_idempotensi WHERE kunci = $1',
    [kunci]
  );
  return rows[0] ?? null;
}

/**
 * Dilempar saat permintaan kembar tiba benar-benar bersamaan — yang kedua kalah
 * di PRIMARY KEY sebelum yang pertama sempat menyimpan nomor pesanannya.
 * Ditangani di lapisan route: tunggu sebentar, lalu kembalikan pesanan yang
 * sudah dibuat permintaan pertama.
 */
class PermintaanKembar extends Error {}

/**
 * Menunggu sampai pesanan milik sebuah kunci selesai dibuat.
 * Dipakai ketika permintaan kembar kalah balapan.
 */
async function tungguPesananKunci(kunci, userId, percobaan = 10) {
  for (let i = 0; i < percobaan; i++) {
    const catatan = await bacaKunci(pool, kunci);
    if (catatan?.order_id) {
      if (Number(catatan.user_id) !== Number(userId)) throw new KunciIdempotensiDipakaiUlang();
      return tanpaUserId(await bacaPesanan(pool, catatan.order_id));
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new KunciIdempotensiDipakaiUlang();
}

export { PermintaanKembar, tungguPesananKunci };

export async function batalkanPesanan({ userId, orderId }) {
  await withTransaction(async (c) => {
    const { rows } = await c.query(
      `SELECT o.id, o.user_id, o.status, o.total,
              (s.status = 'open' AND now() < s.batas_waktu_pesan) AS boleh
       FROM orders o
       JOIN service_days s ON s.tanggal = o.tanggal_layanan
       WHERE o.id = $1`,
      [orderId]
    );

    if (rows.length === 0) throw new PesananTidakDitemukan();
    const pesanan = rows[0];

    // Urutan pemeriksaan ini disengaja: pesanan yang tidak ada menghasilkan 404,
    // pesanan orang lain menghasilkan 403. Membalik keduanya akan memberi tahu
    // penyerang id mana yang benar-benar ada.
    if (Number(pesanan.user_id) !== Number(userId)) throw new TidakBerwenang();
    if (pesanan.status === 'cancelled') throw new PesananSudahDibatalkan();
    if (pesanan.status === 'delivered') throw new PesananSudahDikirim();
    if (!pesanan.boleh) throw new LewatBatasWaktu();

    // Pemeriksaan di atas hanya untuk memberi pesan yang tepat. Yang MENJAMIN
    // tidak ada pengembalian dobel adalah syarat status di WHERE ini: dua
    // pembatalan bersamaan, hanya satu yang mengubah baris.
    const ubah = await c.query(
      `UPDATE orders SET status = 'cancelled'
       WHERE id = $1 AND status = 'confirmed'
       RETURNING id`,
      [orderId]
    );
    if (ubah.rowCount === 0) throw new PesananSudahDibatalkan();

    // Urutan penguncian sama seperti saat memesan: users dulu, baru
    // daily_menu_items. Membaliknya di sini akan membuat pembatalan dan
    // pemesanan yang berjalan bersamaan saling mengunci.
    await c.query('UPDATE users SET saldo = saldo + $2 WHERE id = $1', [userId, pesanan.total]);

    await c.query(
      `INSERT INTO credit_ledger (user_id, jumlah, jenis, ref_order_id, catatan)
       VALUES ($1, $2, 'refund', $3, $4)`,
      [userId, pesanan.total, orderId, `pembatalan #${orderId}`]
    );

    const { rows: item } = await c.query(
      `SELECT daily_menu_item_id, jumlah FROM order_items
       WHERE order_id = $1
       ORDER BY daily_menu_item_id`,
      [orderId]
    );
    for (const baris of item) {
      await c.query(
        `UPDATE daily_menu_items SET terjual = terjual - $2 WHERE id = $1`,
        [baris.daily_menu_item_id, baris.jumlah]
      );
    }
  });
}

export async function lihatPesanan({ userId, orderId }) {
  const pesanan = await bacaPesanan(pool, orderId);
  if (!pesanan) throw new PesananTidakDitemukan();
  if (Number(pesanan.userId) !== Number(userId)) throw new TidakBerwenang();
  return tanpaUserId(pesanan);
}

export async function lihatPesananSaya(userId) {
  const { rows } = await pool.query(
    `SELECT id, to_char(tanggal_layanan, 'YYYY-MM-DD') AS tanggal,
            status, total, alamat_antar
     FROM orders WHERE user_id = $1
     ORDER BY id DESC
     LIMIT 200`,
    [userId]
  );

  return rows.map((r) => ({
    id: r.id,
    tanggal: r.tanggal,
    status: r.status,
    total: r.total,
    alamatAntar: r.alamat_antar,
  }));
}
