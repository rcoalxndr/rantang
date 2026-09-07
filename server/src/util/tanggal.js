import { TanggalTidakValid } from '../errors.js';

const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Memastikan string benar-benar tanggal yang ada.
 *
 * Regex saja tidak cukup — '2026-02-30' lolos pola tapi bukan tanggal nyata.
 * Perbandingan dilakukan lewat UTC supaya hasilnya tidak bergantung zona waktu
 * mesin yang menjalankan: `new Date('2026-02-30T00:00:00Z')` menggelinding jadi
 * 2 Maret, sehingga hasil `toISOString()`-nya tidak lagi cocok dengan masukan.
 */
export function validasiTanggal(tanggal) {
  if (typeof tanggal !== 'string' || !POLA_TANGGAL.test(tanggal)) throw new TanggalTidakValid();
  const d = new Date(`${tanggal}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== tanggal) {
    throw new TanggalTidakValid();
  }
  return tanggal;
}
