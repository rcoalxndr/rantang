import { pool } from '../db.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { buatSesi, hapusSesi } from '../auth/session.js';
import {
  EmailSudahDipakai,
  EmailTidakValid,
  KredensialSalah,
  NamaKosong,
  AkunNonaktif,
} from '../errors.js';

// Sengaja longgar. Satu-satunya cara benar memastikan sebuah email nyata adalah
// mengirim surel ke sana; regex yang ketat hanya menolak alamat sah yang aneh.
const POLA_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalkanEmail(email) {
  if (typeof email !== 'string') throw new EmailTidakValid();
  const bersih = email.trim().toLowerCase();
  if (!POLA_EMAIL.test(bersih)) throw new EmailTidakValid();
  return bersih;
}

/**
 * Hash umpan untuk menyeragamkan waktu respons saat email tidak ditemukan.
 * Dihitung sekali lalu dipakai ulang; lihat penjelasan di `masuk`.
 */
let umpanPromise;
function hashUmpan() {
  umpanPromise ??= hashPassword('umpan-agar-waktu-respons-seragam');
  return umpanPromise;
}

export async function daftar({ email, kataSandi, nama, pic = '', telepon = '', alamat = '' }) {
  const emailBersih = normalkanEmail(email);

  if (typeof nama !== 'string' || nama.trim() === '') throw new NamaKosong();

  // Hash dihitung sebelum INSERT. Kalau kata sandinya ditolak di sini, tidak ada
  // baris apa pun yang terlanjur dibuat.
  const hash = await hashPassword(kataSandi);

  try {
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, nama, pic, telepon, alamat)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, nama, pic, telepon, alamat, peran, saldo`,
      [
        emailBersih,
        hash,
        nama.trim(),
        String(pic ?? ''),
        String(telepon ?? ''),
        String(alamat ?? ''),
      ]
    );
    return rows[0];
  } catch (err) {
    // 23505 = unique_violation. Ditangkap, bukan diperiksa lebih dulu dengan
    // SELECT: pemeriksaan terpisah punya celah waktu — dua pendaftaran bersamaan
    // bisa sama-sama lolos pemeriksaan lalu sama-sama menulis. Batasan UNIQUE di
    // database tidak punya celah itu.
    if (err.code === '23505') throw new EmailSudahDipakai();
    throw err;
  }
}

export async function masuk({ email, kataSandi }) {
  const emailBersih = typeof email === 'string' ? email.trim().toLowerCase() : '';

  const { rows } = await pool.query(
    `SELECT id, email, nama, pic, telepon, alamat, peran, saldo, aktif, password_hash
     FROM users WHERE email = $1`,
    [emailBersih]
  );
  const user = rows[0];

  // Verifikasi tetap dijalankan meski user tidak ada, memakai hash umpan.
  // Kalau tidak, permintaan dengan email tak terdaftar akan dijawab jauh lebih
  // cepat daripada email terdaftar dengan kata sandi salah — dan dari selisih
  // waktu itu seseorang bisa menyusun daftar email yang terdaftar di sistemmu.
  const hashDibanding = user?.password_hash ?? (await hashUmpan());
  const cocok = await verifyPassword(kataSandi, hashDibanding);

  // Error yang sama persis untuk "email tidak ada" dan "kata sandi salah",
  // dengan alasan yang sama: jangan beri tahu email mana yang terdaftar.
  if (!user || !cocok) throw new KredensialSalah();

  // Diperiksa SETELAH kata sandi diverifikasi. Kalau diperiksa lebih dulu,
  // pesan "akun nonaktif" akan memberi tahu penebak bahwa email itu terdaftar —
  // padahal seluruh alur ini dirancang supaya tidak membocorkan hal itu.
  if (!user.aktif) throw new AkunNonaktif();

  const sesi = await buatSesi(user.id);

  delete user.password_hash;
  return { user, sesi };
}

export async function keluar(idSesi) {
  await hapusSesi(idSesi);
}
