import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { KataSandiTerlaluPendek } from '../errors.js';

const scrypt = promisify(scryptCb);

// Parameter biaya scrypt. N adalah faktor kerja (harus pangkat dua), r ukuran
// blok, p tingkat paralel. Memori yang dipakai kira-kira 128 * N * r byte =
// 16 MB di sini — cukup mahal bagi penyerang, masih ringan bagi server.
const N = 16384;
const R = 8;
const P = 1;
const PANJANG_KUNCI = 32;
const PANJANG_GARAM = 16;
const PANJANG_MIN_KATA_SANDI = 8;

/**
 * Mengubah kata sandi jadi hash bergaram.
 * Hasil: "scrypt$N$r$p$<garam base64>$<hash base64>"
 *
 * Parameter ikut disimpan supaya hash lama tetap bisa diverifikasi kalau suatu
 * saat N dinaikkan.
 */
export async function hashPassword(kataSandi) {
  if (typeof kataSandi !== 'string' || kataSandi.length < PANJANG_MIN_KATA_SANDI) {
    throw new KataSandiTerlaluPendek();
  }

  const garam = randomBytes(PANJANG_GARAM);
  const kunci = await scrypt(kataSandi, garam, PANJANG_KUNCI, { N, r: R, p: P });

  return ['scrypt', N, R, P, garam.toString('base64'), kunci.toString('base64')].join('$');
}

/**
 * Memeriksa kata sandi terhadap hash tersimpan.
 * Selalu mengembalikan boolean — masukan rusak menghasilkan false, bukan error,
 * supaya penyerang tidak bisa membedakan "format rusak" dari "kata sandi salah".
 */
export async function verifyPassword(kataSandi, tersimpan) {
  if (typeof kataSandi !== 'string' || typeof tersimpan !== 'string') return false;

  const bagian = tersimpan.split('$');
  if (bagian.length !== 6 || bagian[0] !== 'scrypt') return false;

  const [, nTeks, rTeks, pTeks, garamB64, hashB64] = bagian;
  const n = Number(nTeks);
  const r = Number(rTeks);
  const p = Number(pTeks);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  const garam = Buffer.from(garamB64, 'base64');
  const hashTersimpan = Buffer.from(hashB64, 'base64');
  if (garam.length === 0 || hashTersimpan.length === 0) return false;

  let kunci;
  try {
    kunci = await scrypt(kataSandi, garam, hashTersimpan.length, { N: n, r, p });
  } catch {
    return false;
  }

  // timingSafeEqual melempar kalau panjangnya beda, jadi diperiksa dulu.
  // Panjang hash bukan rahasia, jadi memeriksanya lebih dulu tidak membocorkan apa pun.
  if (kunci.length !== hashTersimpan.length) return false;

  // Perbandingan biasa (===) berhenti di byte pertama yang berbeda, sehingga
  // lamanya perbandingan membocorkan berapa banyak byte awal yang sudah benar.
  // timingSafeEqual selalu memeriksa seluruh isi buffer.
  return timingSafeEqual(kunci, hashTersimpan);
}
