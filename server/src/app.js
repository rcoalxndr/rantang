import express from 'express';
import { bacaCookie } from './auth/cookie.js';
import { lampirkanSesi } from './auth/middleware.js';
import { cors } from './http/cors.js';
import { KesalahanDomain } from './errors.js';
import { routerAuth } from './routes/auth.js';
import { routerMenu } from './routes/menu.js';
import { routerKitchen } from './routes/kitchen.js';

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
  res.status(500).json({
    error: { code: 'KESALAHAN_SERVER', message: 'Terjadi kesalahan di server.' },
  });
}

export function buatApp() {
  const app = express();

  app.use(express.json());
  app.use(bacaCookie);
  app.use(cors);
  app.use(lampirkanSesi);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', routerAuth);
  app.use('/api', routerMenu);
  app.use('/api/kitchen', routerKitchen);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'TIDAK_DITEMUKAN', message: 'Endpoint tidak ada.' } });
  });

  // Express 5 meneruskan promise yang ditolak dari handler async ke sini
  // secara otomatis; di Express 4 setiap handler harus dibungkus try/catch.
  app.use(penanganError);

  return app;
}
