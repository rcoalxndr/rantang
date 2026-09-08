import { Router } from 'express';
import {
  buatPesanan,
  batalkanPesanan,
  lihatPesanan,
  lihatPesananSaya,
  PermintaanKembar,
  tungguPesananKunci,
} from '../services/order.js';
import { ajukanTopup, daftarTopupSaya, lihatSaldo } from '../services/saldo.js';
import { wajibMasuk } from '../auth/middleware.js';

/**
 * Endpoint sisi toko. Router dipecah per sumber daya, bukan satu router besar
 * yang dipasang di '/api'.
 *
 * Alasannya bukan estetika: router dengan `use(wajibMasuk)` yang dipasang di
 * prefix luas akan menelan SEMUA jalur di bawah prefix itu, termasuk yang tidak
 * dikenal — sehingga `/api/salah-ketik` dijawab 401 "harus masuk dulu" alih-alih
 * 404 "tidak ada". Pemasangan yang sempit membuat jalur tak dikenal jatuh ke
 * penangan 404 sebagaimana mestinya.
 *
 * Pemeriksaan kepemilikan TIDAK ada di sini. Itu tugas lapisan layanan, karena
 * bergantung pada baris yang baru diketahui setelah diambil dari database.
 */

export const routerPesanan = Router();
routerPesanan.use(wajibMasuk);

routerPesanan.post('/', async (req, res) => {
  const { tanggal, item } = req.body ?? {};

  // Klien boleh mengirim kunci acak sekali per niat memesan. Header standar
  // untuk ini adalah Idempotency-Key; dipakai luas oleh API pembayaran karena
  // masalahnya sama persis — permintaan yang diulang tidak boleh berarti uang
  // terpotong dua kali.
  const kunciIdempotensi = req.get('Idempotency-Key') || null;

  try {
    const pesanan = await buatPesanan({
      userId: req.user.id,
      tanggal,
      item,
      kunciIdempotensi,
    });
    res.status(201).json({ pesanan });
  } catch (err) {
    // Permintaan kembar yang tiba benar-benar bersamaan: yang ini kalah di
    // PRIMARY KEY. Tunggu sebentar sampai kembarannya selesai, lalu kembalikan
    // pesanan yang sama — dari sudut pandang pemakai, kedua klik berhasil dan
    // menghasilkan satu pesanan.
    if (err instanceof PermintaanKembar) {
      const pesanan = await tungguPesananKunci(kunciIdempotensi, req.user.id);
      return res.status(200).json({ pesanan });
    }
    throw err;
  }
});

routerPesanan.get('/', async (req, res) => {
  res.json({ pesanan: await lihatPesananSaya(req.user.id) });
});

routerPesanan.get('/:id', async (req, res) => {
  const pesanan = await lihatPesanan({ userId: req.user.id, orderId: req.params.id });
  res.json({ pesanan });
});

routerPesanan.post('/:id/cancel', async (req, res) => {
  await batalkanPesanan({ userId: req.user.id, orderId: req.params.id });
  res.status(204).end();
});

export const routerTopup = Router();
routerTopup.use(wajibMasuk);

routerTopup.post('/', async (req, res) => {
  const { nominal, catatanBukti } = req.body ?? {};
  const topup = await ajukanTopup({ userId: req.user.id, nominal, catatanBukti });
  res.status(201).json({ topup });
});

routerTopup.get('/', async (req, res) => {
  res.json({ topup: await daftarTopupSaya(req.user.id) });
});

export const routerSaldo = Router();
routerSaldo.use(wajibMasuk);

routerSaldo.get('/', async (req, res) => {
  res.json(await lihatSaldo(req.user.id));
});
