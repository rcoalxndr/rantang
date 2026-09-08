import { pool } from '../db.js';
import { TerlaluSeringMencoba } from '../errors.js';

/**
 * Pembatasan laju berbasis database.
 *
 * Penghitungnya disimpan di PostgreSQL, bukan di memori. Alasannya bukan
 * kerapian: di lingkungan tanpa server, tiap permintaan bisa dilayani instance
 * yang baru dibangunkan, dan penghitung di memori akan selalu mulai dari nol —
 * artinya tidak membatasi apa pun sama sekali.
 *
 * Seluruh logikanya satu pernyataan SQL, pola yang sama seperti kuota dan saldo:
 * membaca, menambah, dan mengatur ulang jendela terjadi sekaligus, sehingga
 * seratus permintaan bersamaan tetap menghasilkan hitungan yang benar.
 */
export async function catatPercobaan(kunci, { batas, jendelaDetik }) {
  const { rows } = await pool.query(
    `INSERT INTO pembatasan_laju (kunci, jumlah, mulai)
     VALUES ($1, 1, now())
     ON CONFLICT (kunci) DO UPDATE SET
       jumlah = CASE
                  WHEN pembatasan_laju.mulai < now() - make_interval(secs => $2)
                  THEN 1
                  ELSE pembatasan_laju.jumlah + 1
                END,
       mulai  = CASE
                  WHEN pembatasan_laju.mulai < now() - make_interval(secs => $2)
                  THEN now()
                  ELSE pembatasan_laju.mulai
                END
     RETURNING jumlah`,
    [kunci, jendelaDetik]
  );

  return rows[0].jumlah <= batas;
}

/** Menghapus penghitung sebuah kunci, dipakai setelah percobaan yang berhasil. */
export async function lupakanPercobaan(kunci) {
  await pool.query('DELETE FROM pembatasan_laju WHERE kunci = $1', [kunci]);
}

/**
 * Alamat IP pemanggil.
 *
 * `req.ip` bisa dipercaya karena `trust proxy` sudah diaktifkan di app.js —
 * Express membaca X-Forwarded-For yang dipasang proxy penyedia. Tanpa itu,
 * setiap permintaan akan terlihat berasal dari alamat internal yang sama dan
 * pembatasan per-IP justru akan memblokir semua orang sekaligus.
 */
export function ipPemanggil(req) {
  return req.ip ?? 'tidak-diketahui';
}

/**
 * Middleware pembatas laju.
 *
 * `kunciDari` menentukan apa yang dihitung — per IP, per email, atau gabungan.
 * Membatasi login per EMAIL, bukan per IP, disengaja: penyerang bisa berganti
 * IP dengan mudah, tapi tidak bisa mengganti email korban yang sedang ia coba
 * tebak kata sandinya.
 */
export function batasiLaju({ kunciDari, batas, jendelaDetik }) {
  return async (req, _res, next) => {
    try {
      const kunci = kunciDari(req);
      if (!kunci) return next();

      const bolehLanjut = await catatPercobaan(kunci, { batas, jendelaDetik });
      if (!bolehLanjut) return next(new TerlaluSeringMencoba());

      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Membuang penghitung yang jendelanya sudah lama lewat. */
export async function bersihkanPembatasanLama() {
  const { rowCount } = await pool.query(
    `DELETE FROM pembatasan_laju WHERE mulai < now() - INTERVAL '1 day'`
  );
  return rowCount;
}
