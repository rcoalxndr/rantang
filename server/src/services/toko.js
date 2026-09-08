import { pool, withTransaction } from '../db.js';
import {
  TidakBerwenang,
  PenggunaTidakDitemukan,
  NominalTidakValid,
  CatatanKoreksiWajib,
  SaldoTidakCukup,
} from '../errors.js';

/** Berapa banyak baris paling banyak dikembalikan sekali baca. */
const BATAS_DAFTAR = 200;

/**
 * Daftar toko untuk dapur, lengkap dengan angka yang menentukan keputusan:
 * deposit sekarang, berapa pesanan yang pernah dibuat, dan kapan terakhir
 * memesan. Tanpa itu dapur cuma melihat daftar nama dan tidak bisa memutuskan
 * apa pun.
 */
export async function daftarToko() {
  const { rows } = await pool.query(
    `SELECT u.id, u.nama, u.pic, u.email, u.telepon, u.alamat, u.saldo, u.aktif,
            u.dibuat_pada,
            COUNT(o.id) FILTER (WHERE o.status <> 'cancelled')::int AS jumlah_pesanan,
            MAX(o.dibuat_pada)                                      AS pesanan_terakhir
     FROM users u
     LEFT JOIN orders o ON o.user_id = u.id
     WHERE u.peran = 'toko'
     GROUP BY u.id
     ORDER BY u.aktif DESC, u.nama
     LIMIT $1`,
    [BATAS_DAFTAR]
  );

  return rows.map((r) => ({
    id: r.id,
    nama: r.nama,
    pic: r.pic,
    email: r.email,
    telepon: r.telepon,
    alamat: r.alamat,
    saldo: r.saldo,
    aktif: r.aktif,
    dibuatPada: r.dibuat_pada,
    jumlahPesanan: r.jumlah_pesanan,
    pesananTerakhir: r.pesanan_terakhir,
  }));
}

async function pastikanToko(klien, userId) {
  const { rows } = await klien.query('SELECT id, peran, aktif FROM users WHERE id = $1', [userId]);
  if (rows.length === 0) throw new PenggunaTidakDitemukan();
  if (rows[0].peran !== 'toko') throw new TidakBerwenang();
  return rows[0];
}

/**
 * Menonaktifkan atau mengaktifkan kembali sebuah toko.
 *
 * Saat dinonaktifkan, seluruh sesinya ikut dihapus — kalau tidak, orang yang
 * sudah terlanjur masuk tetap bisa memesan sampai cookienya kedaluwarsa
 * berminggu-minggu kemudian. Mencabut akses berarti mencabutnya sekarang, bukan
 * nanti.
 */
export async function setAktifToko({ userId, aktif }) {
  return withTransaction(async (c) => {
    await pastikanToko(c, userId);

    const { rows } = await c.query(
      'UPDATE users SET aktif = $2 WHERE id = $1 RETURNING id, nama, aktif',
      [userId, Boolean(aktif)]
    );

    if (!aktif) {
      await c.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    }

    return { id: rows[0].id, nama: rows[0].nama, aktif: rows[0].aktif };
  });
}

/**
 * Koreksi deposit oleh dapur.
 *
 * Dipakai saat dapur salah menyetujui pengisian — transfer yang ternyata tidak
 * masuk, atau nominal yang salah dibaca. Nilainya boleh negatif (menarik
 * kembali) maupun positif (menambah yang kurang).
 *
 * Catatannya WAJIB. Angka yang berubah tanpa alasan tertulis adalah persis hal
 * yang membuat buku besar tidak lagi bisa dipercaya enam bulan kemudian, saat
 * tidak seorang pun ingat kenapa.
 */
export async function koreksiDeposit({ dapurId, userId, jumlah, catatan }) {
  if (!Number.isInteger(jumlah) || jumlah === 0) throw new NominalTidakValid();
  if (typeof catatan !== 'string' || catatan.trim().length < 3) throw new CatatanKoreksiWajib();

  return withTransaction(async (c) => {
    await pastikanToko(c, userId);

    // Pola yang sama seperti di seluruh proyek: syarat ada di dalam WHERE.
    // Untuk koreksi negatif, saldo tidak boleh jatuh di bawah nol.
    const ubah = await c.query(
      `UPDATE users SET saldo = saldo + $2
       WHERE id = $1 AND saldo + $2 >= 0
       RETURNING saldo`,
      [userId, jumlah]
    );
    if (ubah.rowCount === 0) throw new SaldoTidakCukup();

    await c.query(
      `INSERT INTO credit_ledger (user_id, jumlah, jenis, catatan)
       VALUES ($1, $2, 'koreksi', $3)`,
      [userId, jumlah, `${catatan.trim()} (oleh dapur #${dapurId})`]
    );

    return { userId, saldoBaru: ubah.rows[0].saldo };
  });
}

/**
 * Membuang sesi dan penghitung pembatasan laju yang sudah kedaluwarsa.
 *
 * Tidak wajib untuk kebenaran — sesi basi sudah ditolak saat dibaca — tapi
 * tabel yang tumbuh selamanya akhirnya jadi masalah tersendiri.
 */
export async function bersihkanDataKedaluwarsa() {
  const sesi = await pool.query('DELETE FROM sessions WHERE kedaluwarsa <= now()');
  const laju = await pool.query(
    `DELETE FROM pembatasan_laju WHERE mulai < now() - INTERVAL '1 day'`
  );
  const kunci = await pool.query(
    `DELETE FROM kunci_idempotensi WHERE dibuat_pada < now() - INTERVAL '7 days'`
  );

  return { sesi: sesi.rowCount, laju: laju.rowCount, kunci: kunci.rowCount };
}
