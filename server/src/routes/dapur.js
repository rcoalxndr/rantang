import { Router } from 'express';
import {
  buatMenuItem,
  daftarMenuItem,
  bukaTanggalLayanan,
  tutupTanggalLayanan,
} from '../services/menu.js';
import { daftarTopupPending, setujuiTopup, tolakTopup } from '../services/saldo.js';
import { daftarProduksi, daftarAntar, tandaiTerkirim } from '../services/dapur.js';
import {
  daftarToko,
  setAktifToko,
  koreksiDeposit,
  bersihkanDataKedaluwarsa,
} from '../services/toko.js';
import { wajibPeran } from '../auth/middleware.js';

export const routerDapur = Router();

// Seluruh router ini hanya untuk peran dapur. Dipasang sekali di sini,
// bukan diulang di tiap rute — satu baris yang lupa ditulis di rute baru
// adalah cara paling umum lubang otorisasi muncul.
routerDapur.use(wajibPeran('dapur'));

routerDapur.get('/menu-items', async (_req, res) => {
  res.json({ item: await daftarMenuItem() });
});

routerDapur.post('/menu-items', async (req, res) => {
  const { nama, deskripsi, harga } = req.body ?? {};
  const item = await buatMenuItem({ nama, deskripsi, harga });
  res.status(201).json({ item });
});

routerDapur.post('/service-days', async (req, res) => {
  const { tanggal, batasWaktuPesan, item } = req.body ?? {};
  const hasil = await bukaTanggalLayanan({ tanggal, batasWaktuPesan, item });
  res.status(201).json(hasil);
});

routerDapur.post('/service-days/:tanggal/close', async (req, res) => {
  await tutupTanggalLayanan(req.params.tanggal);
  res.status(204).end();
});

routerDapur.get('/topups', async (_req, res) => {
  res.json({ topup: await daftarTopupPending() });
});

routerDapur.post('/topups/:id/approve', async (req, res) => {
  res.json(await setujuiTopup({ reviewerId: req.user.id, topupId: req.params.id }));
});

routerDapur.post('/topups/:id/reject', async (req, res) => {
  res.json(await tolakTopup({ reviewerId: req.user.id, topupId: req.params.id }));
});

routerDapur.get('/production', async (req, res) => {
  res.json(await daftarProduksi(req.query.tanggal));
});

routerDapur.get('/deliveries', async (req, res) => {
  res.json(await daftarAntar(req.query.tanggal));
});

routerDapur.post('/orders/:id/deliver', async (req, res) => {
  res.json(await tandaiTerkirim(req.params.id));
});

routerDapur.get('/toko', async (_req, res) => {
  res.json({ toko: await daftarToko() });
});

routerDapur.post('/toko/:id/nonaktifkan', async (req, res) => {
  res.json(await setAktifToko({ userId: req.params.id, aktif: false }));
});

routerDapur.post('/toko/:id/aktifkan', async (req, res) => {
  res.json(await setAktifToko({ userId: req.params.id, aktif: true }));
});

routerDapur.post('/toko/:id/koreksi-deposit', async (req, res) => {
  const { jumlah, catatan } = req.body ?? {};
  res.json(
    await koreksiDeposit({
      dapurId: req.user.id,
      userId: req.params.id,
      jumlah: Number(jumlah),
      catatan,
    })
  );
});

routerDapur.post('/bersihkan', async (_req, res) => {
  res.json(await bersihkanDataKedaluwarsa());
});
