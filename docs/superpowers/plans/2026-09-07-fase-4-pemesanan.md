# Rantang — Fase 4: Inti Pemesanan (dikerjakan Rico)

**Spec:** `docs/superpowers/specs/2026-09-07-rantang-pemesanan-design.md` bagian 5
**Test:** `server/tests/order_service.test.js` — sudah ditulis, semuanya merah
**Yang kamu tulis:** `server/src/services/order.js`

Dokumen ini memberi **kontrak dan pola**, bukan kode jadi. Test-nya sudah
mengunci perilaku yang benar; tugasmu membuatnya hijau.

---

## Cara mengerjakan

```bash
cd server
npm test 2>&1 | head -40
```

Kerjakan satu test dari atas ke bawah. Jangan mengejar semuanya sekaligus —
buat satu hijau, jalankan lagi, lanjut. Dua test terakhir (perebutan bersamaan)
kerjakan paling akhir; kalau enam belas test di atasnya sudah benar, keduanya
biasanya ikut hijau, dan kalau tidak, kamu akan tahu persis apa yang kurang.

**Jangan mengubah berkas test.** Kalau kamu yakin ada test yang salah, bilang
dulu — bisa jadi memang salah (sudah pernah terjadi), tapi mengubah test supaya
cocok dengan kode adalah cara paling cepat menipu diri sendiri.

---

## Kontrak yang harus dipenuhi

Empat fungsi diekspor. Nama field harus persis seperti ini, karena test
memeriksanya.

### `buatPesanan({ userId, tanggal, item })`

`item` adalah array `{ dailyMenuItemId, jumlah }`.

Mengembalikan objek pesanan:

```js
{
  id,                       // number
  tanggal: '2030-01-01',    // STRING, bukan objek Date — pakai to_char di SQL
  status: 'confirmed',
  total,                    // number, rupiah
  alamatAntar,              // string, snapshot dari users.alamat saat memesan
  item: [
    { dailyMenuItemId, nama, jumlah, hargaSatuan, subtotal }
  ]
}
```

### `batalkanPesanan({ userId, orderId })`

Tidak ada nilai kembali yang diperiksa test.

### `lihatPesanan({ userId, orderId })`

Bentuk sama dengan hasil `buatPesanan`.

### `lihatPesananSaya(userId)`

Array `{ id, tanggal, status, total, alamatAntar }`, tanpa `item`.

---

## Error yang harus dilempar

Semuanya sudah ada di `src/errors.js`, tinggal di-import.

| Situasi | Error |
|---|---|
| `item` bukan array atau kosong | `ItemPesananKosong` |
| `jumlah` bukan bilangan bulat > 0 | `JumlahTidakValid` |
| tanggal belum dibuka | `TanggalLayananTidakDitemukan` |
| hari `closed`, atau sudah lewat batas waktu | `LewatBatasWaktu` |
| `dailyMenuItemId` tidak ada di tanggal itu | `ItemMenuTidakDitemukan` |
| sisa kuota kurang | `KuotaHabis` |
| saldo kurang | `SaldoTidakCukup` |
| pesanan tidak ada | `PesananTidakDitemukan` |
| pesanan milik orang lain | `TidakBerwenang` |
| pesanan sudah `cancelled` | `PesananSudahDibatalkan` |

Urutan pemeriksaan penting di satu tempat: **pesanan tidak ada** harus
menghasilkan `PesananTidakDitemukan`, bukan `TidakBerwenang`. Ada test khusus
untuk itu.

---

## Urutan langkah `buatPesanan`

Semuanya di dalam **satu** `withTransaction`.

1. Validasi masukan di JavaScript (item kosong, jumlah tidak valid). Ini murah,
   lakukan sebelum menyentuh database.
2. Baca `service_days` untuk tanggal itu. Tidak ada → `TanggalLayananTidakDitemukan`.
   Bukan `open` atau `now() >= batas_waktu_pesan` → `LewatBatasWaktu`.
3. Baca harga tiap `daily_menu_items` **yang tanggalnya cocok**. Jumlah baris
   yang kembali kurang dari yang diminta → `ItemMenuTidakDitemukan`.
4. Hitung `total` dari harga yang baru dibaca (harga snapshot, bukan harga katalog).
5. Potong saldo.
6. `INSERT` ke `orders`, lalu `order_items`.
7. Klaim kuota tiap item.
8. `INSERT` ke `credit_ledger` — `jenis` `'order'`, `jumlah` **negatif**,
   `ref_order_id` diisi id pesanan.
9. Kembalikan hasil baca pesanan itu.

### Kenapa urutannya begitu

**Saldo dipotong sebelum kuota diklaim.** Baris `daily_menu_items` adalah baris
panas — semua pemesan menu itu memperebutkannya. Baris `users` hanya
diperebutkan pemiliknya. Kunci pada baris panas harus dipegang sesingkat
mungkin, jadi diklaim belakangan. Bonusnya: pesanan yang gagal karena saldo
kurang ditolak sebelum sempat mengantre di baris panas.

**Klaim kuota harus urut `id` menaik** kalau itemnya lebih dari satu. Kalau dua
pesanan mengunci baris 5 dan 9 dengan urutan berlawanan, keduanya saling
menunggu sampai PostgreSQL membunuh salah satunya — *deadlock*. Urutan yang
konsisten menghilangkan kemungkinan itu.

---

## Pola inti: satukan pemeriksaan dan penulisan

Ini bagian yang menentukan seluruh Fase 4. Yang **salah**:

```js
const { rows } = await c.query('SELECT terjual, kuota FROM daily_menu_items WHERE id = $1', [id]);
if (rows[0].terjual + jumlah <= rows[0].kuota) {
  await c.query('UPDATE daily_menu_items SET terjual = terjual + $2 WHERE id = $1', [id, jumlah]);
}
```

Yang **benar**:

```sql
UPDATE daily_menu_items
SET terjual = terjual + $2
WHERE id = $1
  AND terjual + $2 <= kuota
RETURNING terjual
```

Lalu di JavaScript, yang kamu periksa adalah **`result.rowCount`**, bukan isi
barisnya. `rowCount === 0` berarti syaratnya tidak terpenuhi → lempar
`KuotaHabis`, dan transaksinya batal seluruhnya.

Saldo memakai pola yang sama persis:

```sql
UPDATE users
SET saldo = saldo - $2
WHERE id = $1 AND saldo >= $2
RETURNING saldo
```

`rowCount === 0` → `SaldoTidakCukup`.

Kamu sudah melihat pola ini dua kali sebelumnya: `INSERT ... SELECT ... WHERE`
di `services/menu.js`, dan tangkap-`23505` di `services/user.js`. Semuanya
gagasan yang sama — jangan pernah ada celah antara memeriksa dan menulis.

---

## Urutan langkah `batalkanPesanan`

1. Baca pesanan. Tidak ada → `PesananTidakDitemukan`.
2. `user_id` bukan pemanggil → `TidakBerwenang`.
3. Status bukan `confirmed` → `PesananSudahDibatalkan`.
4. Hari sudah `closed` atau lewat batas waktu → `LewatBatasWaktu`.
5. Ubah status jadi `cancelled` — **dengan pola yang sama**:
   `UPDATE orders SET status='cancelled' WHERE id=$1 AND status='confirmed'`.
   `rowCount === 0` → `PesananSudahDibatalkan`.
   Pemeriksaan di langkah 3 hanya untuk memberi pesan yang tepat; yang
   *menjamin* tidak ada pengembalian dobel adalah syarat di `WHERE` ini.
6. Kembalikan kuota tiap item — urut `id` menaik, sama seperti saat memesan.
7. Kembalikan saldo, catat `credit_ledger` dengan `jenis` `'refund'` dan
   `jumlah` **positif**.

Perhatikan: **tidak ada baris yang dihapus.** Status berubah, catatan bertambah.

---

## Petunjuk teknis

- `withTransaction(async (c) => { ... })` sudah ada di `src/db.js`. Semua kueri
  di dalamnya harus lewat `c`, bukan `pool` — kalau lewat `pool`, kueri itu
  jalan di koneksi lain dan **di luar transaksimu**.
- Untuk mengembalikan tanggal sebagai string: `to_char(tanggal, 'YYYY-MM-DD')`.
  Jangan pakai `toISOString()` di JavaScript — itu memundurkan tanggal 7 jam.
- Batas waktu dibandingkan di SQL dengan `now()`, bukan `Date.now()`.
- Untuk membaca beberapa `daily_menu_items` sekaligus: `WHERE id = ANY($1::bigint[])`
  dengan array id, ditambah `AND tanggal = $2::date`.
- Fungsi pembaca (`bacaPesanan`) sebaiknya menerima `klien` sebagai parameter
  supaya bisa dipakai di dalam maupun di luar transaksi — persis seperti
  `bacaMenuHarian` di `services/menu.js`.

---

## Kalau macet

Macet 15–20 menit itu bagian dari belajar. Lebih dari itu, bawa ke sini:
error lengkapnya, kueri yang kamu tulis, dan apa yang kamu harapkan terjadi.

Satu hal yang boleh kamu minta kapan saja tanpa merasa curang: penjelasan
kenapa sesuatu terjadi. Yang tidak akan aku lakukan adalah menuliskan
logikanya untukmu.
