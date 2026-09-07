import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { resetDatabase } from './helper.js';
import {
  buatMenuItem,
  daftarMenuItem,
  bukaTanggalLayanan,
  tutupTanggalLayanan,
  lihatMenuHarian,
  daftarTanggalLayanan,
} from '../src/services/menu.js';
import {
  TanggalTidakValid,
  BatasWaktuTidakValid,
  TanggalSudahDibuka,
  TanggalLayananTidakDitemukan,
  MenuTidakDitemukan,
  MenuGandaDiTanggalSama,
  KuotaTidakValid,
  HargaTidakValid,
  DaftarMenuKosong,
} from '../src/errors.js';

after(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDatabase();
});

const BESOK = '2026-10-01';
const CUTOFF = '2026-09-30T20:00:00+07:00';

async function menuContoh() {
  return buatMenuItem({
    nama: 'Katsu Ayam Saus Rendang',
    deskripsi: 'Katsu ayam, saus rendang, nasi merah',
    harga: 32000,
  });
}

test('menu bisa dibuat dan harganya berupa angka, bukan teks', async () => {
  const menu = await menuContoh();
  assert.equal(menu.nama, 'Katsu Ayam Saus Rendang');
  assert.equal(menu.harga, 32000);
  assert.equal(typeof menu.harga, 'number', 'harga harus angka, bukan string');
});

test('harga menu harus bilangan bulat positif', async () => {
  await assert.rejects(() => buatMenuItem({ nama: 'A', harga: 0 }), HargaTidakValid);
  await assert.rejects(() => buatMenuItem({ nama: 'A', harga: -100 }), HargaTidakValid);
  await assert.rejects(() => buatMenuItem({ nama: 'A', harga: 32000.5 }), HargaTidakValid);
  await assert.rejects(() => buatMenuItem({ nama: 'A', harga: '32000' }), HargaTidakValid);
});

test('daftar menu hanya berisi yang aktif', async () => {
  const a = await menuContoh();
  await buatMenuItem({ nama: 'Menu Lama', harga: 20000 });
  await pool.query('UPDATE menu_items SET aktif = false WHERE nama = $1', ['Menu Lama']);

  const daftar = await daftarMenuItem();
  assert.equal(daftar.length, 1);
  assert.equal(daftar[0].id, a.id);
});

test('tanggal layanan bisa dibuka dengan menu dan kuota', async () => {
  const menu = await menuContoh();
  const hasil = await bukaTanggalLayanan({
    tanggal: BESOK,
    batasWaktuPesan: CUTOFF,
    item: [{ menuItemId: menu.id, kuota: 40 }],
  });

  assert.equal(hasil.tanggal, BESOK);
  assert.equal(hasil.item.length, 1);
  assert.equal(hasil.item[0].kuota, 40);
  assert.equal(hasil.item[0].terjual, 0);
  assert.equal(hasil.item[0].harga, 32000, 'harga disalin dari katalog sebagai snapshot');
});

test('harga bisa ditimpa saat membuka tanggal, katalog tidak ikut berubah', async () => {
  const menu = await menuContoh();
  await bukaTanggalLayanan({
    tanggal: BESOK,
    batasWaktuPesan: CUTOFF,
    item: [{ menuItemId: menu.id, kuota: 10, harga: 35000 }],
  });

  const harian = await lihatMenuHarian(BESOK);
  assert.equal(harian.item[0].harga, 35000);

  const katalog = await daftarMenuItem();
  assert.equal(katalog[0].harga, 32000, 'harga katalog tidak boleh ikut berubah');
});

test('tanggal yang sama tidak bisa dibuka dua kali', async () => {
  const menu = await menuContoh();
  const isi = { tanggal: BESOK, batasWaktuPesan: CUTOFF, item: [{ menuItemId: menu.id, kuota: 10 }] };
  await bukaTanggalLayanan(isi);
  await assert.rejects(() => bukaTanggalLayanan(isi), TanggalSudahDibuka);
});

test('tanggal tidak valid ditolak', async () => {
  const menu = await menuContoh();
  const isi = (tanggal) => ({
    tanggal,
    batasWaktuPesan: CUTOFF,
    item: [{ menuItemId: menu.id, kuota: 10 }],
  });
  await assert.rejects(() => bukaTanggalLayanan(isi('01-10-2026')), TanggalTidakValid);
  await assert.rejects(() => bukaTanggalLayanan(isi('2026-02-30')), TanggalTidakValid);
  await assert.rejects(() => bukaTanggalLayanan(isi('besok')), TanggalTidakValid);
});

test('batas waktu setelah hari layanan berakhir ditolak', async () => {
  const menu = await menuContoh();
  await assert.rejects(
    () =>
      bukaTanggalLayanan({
        tanggal: BESOK,
        batasWaktuPesan: '2026-10-02T09:00:00+07:00',
        item: [{ menuItemId: menu.id, kuota: 10 }],
      }),
    BatasWaktuTidakValid
  );
});

test('batas waktu di pagi hari layanan masih diterima', async () => {
  const menu = await menuContoh();
  const hasil = await bukaTanggalLayanan({
    tanggal: BESOK,
    batasWaktuPesan: '2026-10-01T06:00:00+07:00',
    item: [{ menuItemId: menu.id, kuota: 10 }],
  });
  assert.equal(hasil.tanggal, BESOK);
});

test('kuota harus bilangan bulat positif', async () => {
  const menu = await menuContoh();
  const isi = (kuota) => ({
    tanggal: BESOK,
    batasWaktuPesan: CUTOFF,
    item: [{ menuItemId: menu.id, kuota }],
  });
  await assert.rejects(() => bukaTanggalLayanan(isi(0)), KuotaTidakValid);
  await assert.rejects(() => bukaTanggalLayanan(isi(-5)), KuotaTidakValid);
  await assert.rejects(() => bukaTanggalLayanan(isi(2.5)), KuotaTidakValid);
});

test('daftar menu kosong ditolak', async () => {
  await assert.rejects(
    () => bukaTanggalLayanan({ tanggal: BESOK, batasWaktuPesan: CUTOFF, item: [] }),
    DaftarMenuKosong
  );
});

test('menu yang tidak ada ditolak dan tanggalnya ikut batal', async () => {
  await assert.rejects(
    () =>
      bukaTanggalLayanan({
        tanggal: BESOK,
        batasWaktuPesan: CUTOFF,
        item: [{ menuItemId: 999999, kuota: 10 }],
      }),
    MenuTidakDitemukan
  );

  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM service_days');
  assert.equal(rows[0].n, 0, 'seluruh transaksi harus di-rollback, termasuk service_days');
});

test('menu yang sama dua kali di satu tanggal ditolak', async () => {
  const menu = await menuContoh();
  await assert.rejects(
    () =>
      bukaTanggalLayanan({
        tanggal: BESOK,
        batasWaktuPesan: CUTOFF,
        item: [
          { menuItemId: menu.id, kuota: 10 },
          { menuItemId: menu.id, kuota: 5 },
        ],
      }),
    MenuGandaDiTanggalSama
  );
});

test('melihat menu harian memberi sisa porsi dan status pesan', async () => {
  const menu = await menuContoh();
  await bukaTanggalLayanan({
    tanggal: BESOK,
    batasWaktuPesan: CUTOFF,
    item: [{ menuItemId: menu.id, kuota: 40 }],
  });
  await pool.query('UPDATE daily_menu_items SET terjual = 7 WHERE tanggal = $1::date', [BESOK]);

  const harian = await lihatMenuHarian(BESOK);

  assert.equal(harian.tanggal, BESOK, 'tanggal dikembalikan sebagai teks, bukan objek Date');
  assert.equal(harian.status, 'open');
  assert.equal(harian.item[0].sisa, 33);
  assert.equal(harian.masihBisaPesan, true, 'batas waktunya belum lewat');
});

test('batas waktu yang sudah lewat membuat masihBisaPesan jadi false', async () => {
  const menu = await menuContoh();
  await bukaTanggalLayanan({
    tanggal: '2020-06-01',
    batasWaktuPesan: '2020-05-31T20:00:00+07:00',
    item: [{ menuItemId: menu.id, kuota: 10 }],
  });

  const harian = await lihatMenuHarian('2020-06-01');
  assert.equal(harian.status, 'open', 'statusnya masih open, yang lewat cuma batas waktunya');
  assert.equal(harian.masihBisaPesan, false);
});

test('tanggal layanan yang belum dibuka menghasilkan error 404', async () => {
  await assert.rejects(() => lihatMenuHarian('2030-01-01'), TanggalLayananTidakDitemukan);
});

test('menutup tanggal membuat masihBisaPesan jadi false', async () => {
  const menu = await menuContoh();
  await bukaTanggalLayanan({
    tanggal: '2030-01-01',
    batasWaktuPesan: '2029-12-31T20:00:00+07:00',
    item: [{ menuItemId: menu.id, kuota: 10 }],
  });

  const sebelum = await lihatMenuHarian('2030-01-01');
  assert.equal(sebelum.masihBisaPesan, true);

  await tutupTanggalLayanan('2030-01-01');

  const sesudah = await lihatMenuHarian('2030-01-01');
  assert.equal(sesudah.status, 'closed');
  assert.equal(sesudah.masihBisaPesan, false);
});

test('daftar tanggal hanya memuat hari ini dan seterusnya', async () => {
  const menu = await menuContoh();
  await bukaTanggalLayanan({
    tanggal: '2020-01-01',
    batasWaktuPesan: '2019-12-31T20:00:00+07:00',
    item: [{ menuItemId: menu.id, kuota: 10 }],
  });
  await bukaTanggalLayanan({
    tanggal: '2030-01-01',
    batasWaktuPesan: '2029-12-31T20:00:00+07:00',
    item: [{ menuItemId: menu.id, kuota: 10 }],
  });

  const daftar = await daftarTanggalLayanan();

  assert.equal(daftar.length, 1);
  assert.equal(daftar[0].tanggal, '2030-01-01');
  assert.equal(daftar[0].sisaTotal, 10);
});
