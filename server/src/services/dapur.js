import { pool } from '../db.js';
import { validasiTanggal } from '../util/tanggal.js';
import {
  TanggalLayananTidakDitemukan,
  PesananTidakDitemukan,
  PesananSudahDibatalkan,
  PesananSudahDikirim,
} from '../errors.js';

/**
 * Pesanan yang sudah dibatalkan tidak boleh ikut dihitung di mana pun di
 * berkas ini — dapur tidak memasak unit yang batal, dan kurir tidak
 * mengantarnya ke toko. Yang dihitung hanya 'confirmed' dan 'delivered'.
 */
const STATUS_AKTIF = ['confirmed', 'delivered'];

async function pastikanTanggalAda(tanggal) {
  const { rowCount } = await pool.query('SELECT 1 FROM service_days WHERE tanggal = $1::date', [
    tanggal,
  ]);
  if (rowCount === 0) throw new TanggalLayananTidakDitemukan();
}

/**
 * Daftar produksi: berapa unit tiap menu yang harus dimasak untuk satu tanggal.
 *
 * Ini layar yang dibuka dapur setiap pagi. Angka `jumlah` dihitung ulang dari
 * pesanan yang sebenarnya, bukan dibaca dari `daily_menu_items.terjual` —
 * keduanya seharusnya selalu sama, dan menghitungnya lewat dua jalur berbeda
 * membuat ketidakcocokan langsung kelihatan alih-alih diam-diam terbawa ke
 * dapur. Ada test yang menjaga kesamaan itu.
 */
export async function daftarProduksi(tanggal) {
  validasiTanggal(tanggal);
  await pastikanTanggalAda(tanggal);

  const { rows } = await pool.query(
    `SELECT d.id            AS daily_menu_item_id,
            m.nama,
            d.kuota,
            d.terjual,
            COALESCE(SUM(oi.jumlah), 0)::int AS jumlah
     FROM daily_menu_items d
     JOIN menu_items m ON m.id = d.menu_item_id
     LEFT JOIN order_items oi ON oi.daily_menu_item_id = d.id
     LEFT JOIN orders o       ON o.id = oi.order_id AND o.status = ANY($2)
     WHERE d.tanggal = $1::date
       AND (oi.id IS NULL OR o.id IS NOT NULL)
     GROUP BY d.id, m.nama, d.kuota, d.terjual
     ORDER BY m.nama`,
    [tanggal, STATUS_AKTIF]
  );

  const item = rows.map((r) => ({
    dailyMenuItemId: r.daily_menu_item_id,
    nama: r.nama,
    jumlah: r.jumlah,
    kuota: r.kuota,
    terjual: r.terjual,
  }));

  return {
    tanggal,
    totalPorsi: item.reduce((n, i) => n + i.jumlah, 0),
    item,
  };
}

/**
 * Daftar kirim: satu baris per pesanan toko, lengkap dengan alamat dan isinya.
 *
 * Alamat diambil dari `orders.alamat_antar` (snapshot saat memesan), bukan dari
 * `users.alamat` sekarang. Kalau toko pindah atau memperbarui alamatnya setelah
 * memesan, kiriman hari itu tetap memakai alamat yang berlaku saat pesanan
 * dibuat.
 */
export async function daftarAntar(tanggal) {
  validasiTanggal(tanggal);
  await pastikanTanggalAda(tanggal);

  const { rows: pesanan } = await pool.query(
    `SELECT o.id, o.status, o.total, o.alamat_antar, o.dibuat_pada,
            u.nama, u.pic, u.telepon
     FROM orders o
     JOIN users u ON u.id = o.user_id
     WHERE o.tanggal_layanan = $1::date AND o.status = ANY($2)
     ORDER BY o.id`,
    [tanggal, STATUS_AKTIF]
  );

  const idPesanan = pesanan.map((p) => p.id);
  const { rows: item } = idPesanan.length
    ? await pool.query(
        `SELECT oi.order_id, m.nama, oi.jumlah
         FROM order_items oi
         JOIN daily_menu_items d ON d.id = oi.daily_menu_item_id
         JOIN menu_items m       ON m.id = d.menu_item_id
         WHERE oi.order_id = ANY($1::bigint[])
         ORDER BY oi.id`,
        [idPesanan]
      )
    : { rows: [] };

  const perPesanan = new Map(idPesanan.map((id) => [id, []]));
  for (const r of item) {
    perPesanan.get(r.order_id)?.push({ nama: r.nama, jumlah: r.jumlah });
  }

  return {
    tanggal,
    totalPesanan: pesanan.length,
    pesanan: pesanan.map((p) => ({
      id: p.id,
      nama: p.nama,
      pic: p.pic,
      telepon: p.telepon,
      alamatAntar: p.alamat_antar,
      total: p.total,
      status: p.status,
      item: perPesanan.get(p.id) ?? [],
    })),
  };
}

/**
 * Menandai satu pesanan sudah diantar.
 *
 * Pola yang sama seperti di seluruh proyek: syarat status ada di dalam WHERE,
 * bukan diperiksa lebih dulu di JavaScript. Pemeriksaan di atasnya hanya untuk
 * memilih pesan error yang tepat.
 */
export async function tandaiTerkirim(orderId) {
  const { rows } = await pool.query('SELECT id, status FROM orders WHERE id = $1', [orderId]);
  if (rows.length === 0) throw new PesananTidakDitemukan();
  if (rows[0].status === 'cancelled') throw new PesananSudahDibatalkan();
  if (rows[0].status === 'delivered') throw new PesananSudahDikirim();

  const { rows: diubah } = await pool.query(
    `UPDATE orders SET status = 'delivered'
     WHERE id = $1 AND status = 'confirmed'
     RETURNING id, status`,
    [orderId]
  );
  if (diubah.length === 0) throw new PesananSudahDikirim();

  return { id: diubah[0].id, status: diubah[0].status };
}
