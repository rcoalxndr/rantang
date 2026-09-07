import { ambilSesi } from './session.js';
import { NAMA_COOKIE_SESI } from './cookie.js';
import { BelumMasuk, TidakBerwenang } from '../errors.js';

/**
 * Melampirkan user ke req kalau ada sesi sah. Tidak pernah menolak permintaan —
 * endpoint publik tetap harus bisa dilewati. Penolakan urusan wajibMasuk.
 */
export async function lampirkanSesi(req, _res, next) {
  try {
    const idSesi = req.cookies?.[NAMA_COOKIE_SESI];
    const sesi = await ambilSesi(idSesi);
    req.sesi = sesi;
    req.user = sesi
      ? { id: sesi.user_id, email: sesi.email, nama: sesi.nama, peran: sesi.peran }
      : null;
    next();
  } catch (err) {
    next(err);
  }
}

export function wajibMasuk(req, _res, next) {
  if (!req.user) return next(new BelumMasuk());
  next();
}

/**
 * Menjaga endpoint berdasarkan peran.
 *
 * Ini otorisasi tingkat rute: "peran apa yang boleh menyentuh pintu ini".
 * Pemeriksaan kepemilikan — "apakah baris ini milikmu" — TIDAK di sini, karena
 * bergantung pada data yang baru diketahui setelah diambil. Itu tugas lapisan
 * layanan. Mencampur keduanya adalah asal-usul kerentanan IDOR.
 */
export function wajibPeran(peran) {
  return (req, _res, next) => {
    if (!req.user) return next(new BelumMasuk());
    if (req.user.peran !== peran) return next(new TidakBerwenang());
    next();
  };
}
