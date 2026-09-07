import { Router } from 'express';
import {
  buatMenuItem,
  daftarMenuItem,
  bukaTanggalLayanan,
  tutupTanggalLayanan,
} from '../services/menu.js';
import { wajibPeran } from '../auth/middleware.js';

export const routerKitchen = Router();

// Seluruh router ini hanya untuk peran kitchen. Dipasang sekali di sini,
// bukan diulang di tiap rute — satu baris yang lupa ditulis di rute baru
// adalah cara paling umum lubang otorisasi muncul.
routerKitchen.use(wajibPeran('kitchen'));

routerKitchen.get('/menu-items', async (_req, res) => {
  res.json({ item: await daftarMenuItem() });
});

routerKitchen.post('/menu-items', async (req, res) => {
  const { nama, deskripsi, harga } = req.body ?? {};
  const item = await buatMenuItem({ nama, deskripsi, harga });
  res.status(201).json({ item });
});

routerKitchen.post('/service-days', async (req, res) => {
  const { tanggal, batasWaktuPesan, item } = req.body ?? {};
  const hasil = await bukaTanggalLayanan({ tanggal, batasWaktuPesan, item });
  res.status(201).json(hasil);
});

routerKitchen.post('/service-days/:tanggal/close', async (req, res) => {
  await tutupTanggalLayanan(req.params.tanggal);
  res.status(204).end();
});
