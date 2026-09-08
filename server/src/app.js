import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { bacaCookie } from './auth/cookie.js';
import { lampirkanSesi } from './auth/middleware.js';
import { cors } from './http/cors.js';
import { KesalahanDomain } from './errors.js';
import { routerAuth } from './routes/auth.js';
import { routerMenu } from './routes/menu.js';
import { routerDapur } from './routes/dapur.js';
import { routerPesanan, routerTopup, routerSaldo } from './routes/toko.js';

/** Hasil build frontend. Ada di produksi, biasanya tidak ada saat pengembangan. */
const DIST = fileURLToPath(new URL('../../web/dist/', import.meta.url));

function tidakDitemukan(_req, res) {
  res.status(404).json({ error: { code: 'TIDAK_DITEMUKAN', message: 'Endpoint tidak ada.' } });
}

/**
 * Penanganan error terpusat.
 *
 * Error domain (aturan bisnis) dijawab dengan kode dan pesannya sendiri.
 * Error lain adalah bug: dicatat lengkap di server, tapi ke klien hanya
 * dikirim pesan umum — pesan error internal sering membocorkan nama tabel,
 * kueri, atau jalur berkas.
 */
function penanganError(err, _req, res, _next) {
  if (err instanceof KesalahanDomain) {
    return res.status(err.status).json({ error: { code: err.kode, message: err.message } });
  }

  console.error('[error tak tertangani]', err);

  // DIAGNOSTIK SEMENTARA — dicabut setelah masalah koneksi produksi ketemu.
  // Jangan biarkan ini hidup: pesan error internal bisa membocorkan nama tabel,
  // bentuk kueri, atau jalur berkas.
  res.status(500).json({
    error: {
      code: 'KESALAHAN_SERVER',
      message: 'Terjadi kesalahan di server.',
      diagnostik: { nama: err?.name, kode: err?.code, pesan: err?.message },
    },
  });
}

export function buatApp() {
  const app = express();

  // Di produksi, aplikasi berada di belakang proxy milik penyedia hosting.
  // Tanpa baris ini Express melihat koneksinya sebagai HTTP biasa, menolak
  // memasang cookie `Secure`, dan login gagal tanpa pesan error apa pun —
  // jebakan deploy paling umum untuk aplikasi yang memakai cookie sesi.
  app.set('trust proxy', 1);

  app.use(express.json());
  app.use(bacaCookie);
  app.use(cors);
  app.use(lampirkanSesi);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', routerAuth);
  app.use('/api', routerMenu);
  app.use('/api/dapur', routerDapur);
  app.use('/api/orders', routerPesanan);
  app.use('/api/topups', routerTopup);
  app.use('/api/balance', routerSaldo);

  // Jalur /api yang tidak dikenal selalu dijawab JSON, tidak pernah HTML.
  // Ditempatkan sebelum penyajian berkas statis supaya klien API tidak pernah
  // menerima halaman React sebagai jawaban atas endpoint yang salah ketik.
  app.use('/api', tidakDitemukan);

  /**
   * Di produksi, server yang sama menyajikan hasil build React.
   *
   * Satu layanan, bukan dua: lebih murah, dan yang lebih penting — frontend
   * dan backend jadi satu asal, sehingga cookie sesi bekerja apa adanya dan
   * CORS tidak dibutuhkan sama sekali. Saat pengembangan, peran ini dipegang
   * proxy Vite dan folder dist belum ada, jadi blok ini dilewati.
   */
  if (existsSync(DIST)) {
    app.use(express.static(DIST));
    app.use((_req, res) => res.sendFile(path.join(DIST, 'index.html')));
  } else {
    app.use(tidakDitemukan);
  }

  // Express 5 meneruskan promise yang ditolak dari handler async ke sini
  // secara otomatis; di Express 4 setiap handler harus dibungkus try/catch.
  app.use(penanganError);

  return app;
}
