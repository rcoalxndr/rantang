import { Router } from 'express';
import { lihatMenuHarian, daftarTanggalLayanan } from '../services/menu.js';

export const routerMenu = Router();

// Menu bersifat publik: siapa pun boleh melihat apa yang dimasak besok dan
// berapa sisanya, tanpa perlu punya akun. Yang butuh akun adalah memesannya.

routerMenu.get('/service-days', async (_req, res) => {
  res.json({ tanggal: await daftarTanggalLayanan() });
});

routerMenu.get('/menu', async (req, res) => {
  res.json(await lihatMenuHarian(req.query.tanggal));
});
