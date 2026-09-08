import { Router } from 'express';
import { daftar, masuk, keluar } from '../services/user.js';
import { pasangCookieSesi, hapusCookieSesi, NAMA_COOKIE_SESI } from '../auth/cookie.js';
import { wajibMasuk } from '../auth/middleware.js';
import { batasiLaju, lupakanPercobaan, ipPemanggil } from '../http/laju.js';

export const routerAuth = Router();

// Route hanya menerjemahkan HTTP <-> pemanggilan fungsi. Tidak ada aturan
// bisnis di sini — semuanya ada di src/services/user.js, yang bisa dites tanpa
// menyentuh HTTP sama sekali.

// Pendaftaran dibatasi per alamat IP: 10 akun per jam sudah jauh lebih banyak
// daripada yang dibutuhkan orang jujur, dan cukup untuk menghentikan pembuatan
// akun sampah secara massal.
routerAuth.post(
  '/register',
  batasiLaju({ kunciDari: (req) => `daftar:${ipPemanggil(req)}`, batas: 10, jendelaDetik: 3600 }),
  async (req, res) => {
    const { email, kataSandi, nama, pic, telepon, alamat } = req.body ?? {};
    const user = await daftar({ email, kataSandi, nama, pic, telepon, alamat });
    res.status(201).json({ user });
  }
);

// Percobaan masuk dibatasi per EMAIL, bukan per IP. Penyerang bisa berganti IP
// semudah menyalakan ulang modem, tapi tidak bisa mengganti email korban yang
// sedang ia coba tebak kata sandinya. Penghitungnya dihapus begitu ada login
// yang berhasil, supaya pemilik sah tidak ikut terkunci oleh percobaan orang
// lain terhadap akunnya.
routerAuth.post(
  '/login',
  batasiLaju({
    kunciDari: (req) => {
      const email = req.body?.email;
      return typeof email === 'string' && email.trim() ? `masuk:${email.trim().toLowerCase()}` : null;
    },
    batas: 8,
    jendelaDetik: 900,
  }),
  async (req, res) => {
    const { email, kataSandi } = req.body ?? {};
    const { user, sesi } = await masuk({ email, kataSandi });

    await lupakanPercobaan(`masuk:${String(email).trim().toLowerCase()}`);

    pasangCookieSesi(res, sesi);
    res.json({ user });
  }
);

routerAuth.post('/logout', async (req, res) => {
  await keluar(req.cookies?.[NAMA_COOKIE_SESI]);
  hapusCookieSesi(res);
  res.status(204).end();
});

routerAuth.get('/me', wajibMasuk, (req, res) => {
  res.json({ user: req.user });
});
