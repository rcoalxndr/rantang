import { Router } from 'express';
import { daftar, masuk, keluar } from '../services/user.js';
import { pasangCookieSesi, hapusCookieSesi, NAMA_COOKIE_SESI } from '../auth/cookie.js';
import { wajibMasuk } from '../auth/middleware.js';

export const routerAuth = Router();

// Route hanya menerjemahkan HTTP <-> pemanggilan fungsi. Tidak ada aturan
// bisnis di sini — semuanya ada di src/services/user.js, yang bisa dites tanpa
// menyentuh HTTP sama sekali.

routerAuth.post('/register', async (req, res) => {
  const { email, kataSandi, nama, telepon, alamat } = req.body ?? {};
  const user = await daftar({ email, kataSandi, nama, telepon, alamat });
  res.status(201).json({ user });
});

routerAuth.post('/login', async (req, res) => {
  const { email, kataSandi } = req.body ?? {};
  const { user, sesi } = await masuk({ email, kataSandi });
  pasangCookieSesi(res, sesi);
  res.json({ user });
});

routerAuth.post('/logout', async (req, res) => {
  await keluar(req.cookies?.[NAMA_COOKIE_SESI]);
  hapusCookieSesi(res);
  res.status(204).end();
});

routerAuth.get('/me', wajibMasuk, (req, res) => {
  res.json({ user: req.user });
});
