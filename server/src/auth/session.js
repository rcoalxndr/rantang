import { randomBytes } from 'node:crypto';
import { pool } from '../db.js';

const UMUR_SESI_HARI = 30;
const PANJANG_ID_BYTE = 32;

/**
 * Membuat sesi baru untuk seorang user.
 *
 * Id sesi adalah 32 byte acak — buram, tidak mengandung informasi apa pun.
 * Karena tidak ada isinya yang bisa dibaca atau dipalsukan, satu-satunya cara
 * memakainya adalah memilikinya, dan mencabutnya cukup dengan menghapus baris.
 */
export async function buatSesi(userId) {
  const id = randomBytes(PANJANG_ID_BYTE).toString('base64url');

  const { rows } = await pool.query(
    `INSERT INTO sessions (id, user_id, kedaluwarsa)
     VALUES ($1, $2, now() + ($3 * INTERVAL '1 day'))
     RETURNING id, kedaluwarsa`,
    [id, userId, UMUR_SESI_HARI]
  );

  return rows[0];
}

/**
 * Mengambil sesi yang masih berlaku beserta data user pemiliknya.
 * Mengembalikan null kalau id tidak dikenal atau sesinya sudah kedaluwarsa.
 *
 * Kedaluwarsa diperiksa di dalam kueri (`kedaluwarsa > now()`), bukan di
 * JavaScript, supaya yang dipakai adalah jam database — satu sumber waktu untuk
 * seluruh sistem, dan tidak bisa dipengaruhi jam mesin mana pun.
 */
export async function ambilSesi(id) {
  if (typeof id !== 'string' || id.length === 0) return null;

  const { rows } = await pool.query(
    `SELECT s.id, s.user_id, s.kedaluwarsa, u.email, u.nama, u.peran
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.kedaluwarsa > now() AND u.aktif`,
    [id]
  );

  return rows[0] ?? null;
}

export async function hapusSesi(id) {
  if (typeof id !== 'string' || id.length === 0) return;
  await pool.query('DELETE FROM sessions WHERE id = $1', [id]);
}

/**
 * Menghapus sesi yang sudah kedaluwarsa. Belum dipanggil otomatis di mana pun —
 * sesi basi tidak berbahaya karena `ambilSesi` sudah menolaknya; ini hanya
 * kebersihan. Penjadwalannya urusan nanti, bukan sekarang.
 */
export async function bersihkanSesiKedaluwarsa() {
  const { rowCount } = await pool.query('DELETE FROM sessions WHERE kedaluwarsa <= now()');
  return rowCount;
}
