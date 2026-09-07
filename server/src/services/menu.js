import { pool, withTransaction } from '../db.js';
import {
  BatasWaktuTidakValid,
  TanggalSudahDibuka,
  TanggalLayananTidakDitemukan,
  MenuTidakDitemukan,
  MenuGandaDiTanggalSama,
  KuotaTidakValid,
  HargaTidakValid,
  DaftarMenuKosong,
  NamaKosong,
} from '../errors.js';
import { validasiTanggal } from '../util/tanggal.js';

function validasiRupiah(nilai, Kesalahan) {
  if (!Number.isInteger(nilai) || nilai <= 0) throw new Kesalahan();
  return nilai;
}

export async function buatMenuItem({ nama, deskripsi = '', harga }) {
  if (typeof nama !== 'string' || nama.trim() === '') throw new NamaKosong();
  validasiRupiah(harga, HargaTidakValid);

  const { rows } = await pool.query(
    `INSERT INTO menu_items (nama, deskripsi, harga)
     VALUES ($1, $2, $3) RETURNING id, nama, deskripsi, harga, aktif`,
    [nama.trim(), String(deskripsi ?? ''), harga]
  );
  return rows[0];
}

export async function daftarMenuItem() {
  const { rows } = await pool.query(
    `SELECT id, nama, deskripsi, harga, aktif FROM menu_items
     WHERE aktif ORDER BY nama`
  );
  return rows;
}

/**
 * Membuka satu tanggal layanan beserta menu dan kuotanya.
 *
 * Seluruhnya satu transaksi: kalau salah satu menu tidak valid, tanggalnya pun
 * tidak jadi dibuka. Tidak ada tanggal setengah jadi yang harus dibereskan
 * manual.
 */
export async function bukaTanggalLayanan({ tanggal, batasWaktuPesan, item }) {
  validasiTanggal(tanggal);

  if (!Array.isArray(item) || item.length === 0) throw new DaftarMenuKosong();

  for (const baris of item) {
    if (!Number.isInteger(baris?.kuota) || baris.kuota <= 0) throw new KuotaTidakValid();
    if (baris.harga !== undefined && baris.harga !== null) {
      validasiRupiah(baris.harga, HargaTidakValid);
    }
  }

  if (typeof batasWaktuPesan !== 'string' || Number.isNaN(Date.parse(batasWaktuPesan))) {
    throw new BatasWaktuTidakValid();
  }

  return withTransaction(async (c) => {
    // Batas waktu diperiksa di dalam SQL, bukan JavaScript, karena aturannya
    // menyangkut zona waktu: batas pesan harus jatuh sebelum hari layanan
    // berakhir menurut WIB. Membandingkannya di JS berarti bergantung pada zona
    // waktu mesin yang menjalankan server.
    let dibuat;
    try {
      dibuat = await c.query(
        `INSERT INTO service_days (tanggal, batas_waktu_pesan)
         SELECT $1::date, $2::timestamptz
         WHERE $2::timestamptz < (($1::date + 1)::timestamp AT TIME ZONE 'Asia/Jakarta')
         RETURNING tanggal`,
        [tanggal, batasWaktuPesan]
      );
    } catch (err) {
      if (err.code === '23505') throw new TanggalSudahDibuka();
      throw err;
    }

    // Nol baris berarti syarat WHERE tidak terpenuhi — batas waktunya lewat.
    if (dibuat.rowCount === 0) throw new BatasWaktuTidakValid();

    for (const baris of item) {
      // Harga disalin dari katalog kalau tidak ditentukan. Penyalinan dilakukan
      // di dalam INSERT ... SELECT sehingga menu yang tidak ada atau tidak aktif
      // menghasilkan nol baris — satu kueri untuk menyisipkan sekaligus
      // memvalidasi, tanpa SELECT terpisah yang punya celah waktu.
      let hasil;
      try {
        hasil = await c.query(
          `INSERT INTO daily_menu_items (tanggal, menu_item_id, harga, kuota)
           SELECT $1::date, m.id, COALESCE($3::bigint, m.harga), $4::int
           FROM menu_items m
           WHERE m.id = $2 AND m.aktif
           RETURNING id`,
          [tanggal, baris.menuItemId, baris.harga ?? null, baris.kuota]
        );
      } catch (err) {
        if (err.code === '23505') throw new MenuGandaDiTanggalSama();
        throw err;
      }

      if (hasil.rowCount === 0) throw new MenuTidakDitemukan();
    }

    return bacaMenuHarian(c, tanggal);
  });
}

export async function tutupTanggalLayanan(tanggal) {
  validasiTanggal(tanggal);
  const { rowCount } = await pool.query(
    `UPDATE service_days SET status = 'closed' WHERE tanggal = $1::date`,
    [tanggal]
  );
  if (rowCount === 0) throw new TanggalLayananTidakDitemukan();
}

/**
 * Membaca menu satu tanggal. `klien` bisa berupa pool atau client transaksi,
 * sehingga fungsi ini dapat dipakai di dalam maupun di luar transaksi.
 */
async function bacaMenuHarian(klien, tanggal) {
  const hari = await klien.query(
    `SELECT to_char(tanggal, 'YYYY-MM-DD') AS tanggal,
            status,
            batas_waktu_pesan,
            (status = 'open' AND now() < batas_waktu_pesan) AS masih_bisa_pesan
     FROM service_days WHERE tanggal = $1::date`,
    [tanggal]
  );
  if (hari.rowCount === 0) throw new TanggalLayananTidakDitemukan();

  const item = await klien.query(
    `SELECT d.id, d.menu_item_id, m.nama, m.deskripsi,
            d.harga, d.kuota, d.terjual, (d.kuota - d.terjual) AS sisa
     FROM daily_menu_items d
     JOIN menu_items m ON m.id = d.menu_item_id
     WHERE d.tanggal = $1::date
     ORDER BY m.nama`,
    [tanggal]
  );

  return {
    tanggal: hari.rows[0].tanggal,
    status: hari.rows[0].status,
    batasWaktuPesan: hari.rows[0].batas_waktu_pesan,
    masihBisaPesan: hari.rows[0].masih_bisa_pesan,
    item: item.rows,
  };
}

export async function lihatMenuHarian(tanggal) {
  validasiTanggal(tanggal);
  return bacaMenuHarian(pool, tanggal);
}

/**
 * Tanggal layanan hari ini dan seterusnya, menurut kalender WIB.
 * Batas "hari ini" dihitung di database supaya tidak bergantung jam mesin.
 */
export async function daftarTanggalLayanan() {
  const { rows } = await pool.query(
    `SELECT to_char(s.tanggal, 'YYYY-MM-DD') AS tanggal,
            s.status,
            s.batas_waktu_pesan,
            (s.status = 'open' AND now() < s.batas_waktu_pesan) AS masih_bisa_pesan,
            COALESCE(SUM(d.kuota - d.terjual), 0)::int AS sisa_total
     FROM service_days s
     LEFT JOIN daily_menu_items d ON d.tanggal = s.tanggal
     WHERE s.tanggal >= (now() AT TIME ZONE 'Asia/Jakarta')::date
     GROUP BY s.tanggal, s.status, s.batas_waktu_pesan
     ORDER BY s.tanggal`
  );

  return rows.map((r) => ({
    tanggal: r.tanggal,
    status: r.status,
    batasWaktuPesan: r.batas_waktu_pesan,
    masihBisaPesan: r.masih_bisa_pesan,
    sisaTotal: r.sisa_total,
  }));
}
