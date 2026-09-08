/**
 * Titik masuk untuk Vercel.
 *
 * Di Vercel tidak ada proses yang hidup terus-menerus. Yang ada adalah fungsi
 * yang dibangunkan saat permintaan datang, lalu tidur lagi. Karena itu berkas
 * ini TIDAK memanggil listen() — cukup mengekspor aplikasinya, dan Vercel yang
 * memanggilkannya.
 *
 * Aplikasi Express itu sendiri hanyalah fungsi (req, res), jadi tidak ada yang
 * perlu diubah di src/. Itu buah dari memisahkan `buatApp()` (perakitan) dari
 * `server.js` (menyalakan server) sejak Fase 2 — waktu itu alasannya supaya
 * bisa dites, dan sekarang ternyata juga yang membuat pindah ke serverless
 * cukup satu berkas.
 */
import { buatApp } from '../server/src/app.js';

export default buatApp();
