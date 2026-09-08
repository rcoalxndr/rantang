# Rantang — Sistem Pemesanan Prabayar

**Tanggal:** 2026-09-07 · **direvisi** 2026-09-08 (model bisnis berubah)
**Status:** Terimplementasi (Fase 0–7)
**Penulis:** Rico (bersama Claude)

---

## 1. Konteks & Tujuan

Rantang adalah konsep bisnis makanan siap-santap bergizi seimbang dari mata
kuliah Kewirausahaan. Model bisnisnya: **penyaluran ke toserba dan toko
relevan, mengikuti cara kerja konbini Jepang** — toko memesan sejumlah unit
sebelum batas waktu harian, membelinya putus, dan menanggung sendiri risiko
barang yang tidak laku. Dapur memasak persis sejumlah pesanan yang masuk,
sehingga limbah makanan mendekati nol.

Dokumen ini merancang **perangkat lunak pemesanannya**, bukan bisnisnya.

### Catatan revisi 2026-09-08

Versi pertama dokumen ini merancang model **D2C langganan prabayar** —
konsumen perorangan memesan langsung. Tim kemudian memindahkan konsep ke jalur
ritel, dan spec ini disesuaikan.

Yang perlu dicatat: **bentuk transaksinya tidak berubah sama sekali.** Ada
pembeli yang punya akun dan deposit, memesan sejumlah unit dari menu yang
diproduksi untuk tanggal tertentu, sebelum batas waktu. Yang berganti hanya
siapa pembelinya — toko, bukan individu. Karena itu perubahannya cukup satu
migrasi (`004_toko.sql`) dan penyesuaian kosakata; seluruh 159 test tetap
berlaku tanpa satu pun diubah logikanya.

Satu keputusan bisnis yang sengaja dipertahankan: toko **memesan di muka dan
beli putus**, bukan titip jual. Titip jual akan mengembalikan risiko barang tak
laku ke Rantang, dan itu menghapus pilar "limbah mendekati nol" — pilar yang
juga menopang perhitungan marginnya. Konbini Jepang pun bekerja dengan pesanan
di muka, bukan konsinyasi.

### Tujuan utama: belajar

Ini proyek backend pertama Rico. Seluruh proyek sebelumnya adalah frontend
statis (HTML/CSS/JS, data di browser, deploy ke GitHub Pages). Yang ingin
dicapai:

- memahami server yang menyimpan state
- transaksi database, penguncian baris, dan race condition
- autentikasi dan otorisasi yang benar
- desain skema relasional
- menulis test untuk hal yang sulit

### Tujuan sekunder: portofolio

Repo yang bisa dibaca, dijalankan orang lain, dan menjelaskan keputusannya
sendiri. Deploy langsung dianggap **bonus, bukan syarat** (kendala: Rp 0, tanpa
kartu kredit).

### Kejujuran penyajian

README wajib menyebut bahwa Rantang adalah konsep bisnis dari proyek kuliah,
bukan usaha yang sedang berjalan.

---

## 2. Ruang Lingkup

### Yang dibangun

- Satu dapur
- Dua peran: `toko` dan `dapur`
- Toko: daftar, masuk, lihat menu per tanggal, pesan sejumlah unit, batal,
  lihat deposit dan riwayat mutasinya
- Dapur: buka hari produksi + kuota, lihat daftar produksi, lihat daftar kirim,
  tandai terkirim, setujui pengisian deposit
- Deposit dalam rupiah, diisi lewat transfer manual yang dikonfirmasi dapur.
  Meminta deposit di muka tidak lazim untuk B2B, tapi masuk akal untuk pemasok
  baru yang belum sanggup memberi termin pembayaran.

### Yang sengaja TIDAK dibangun

Gerbang pembayaran · aplikasi/pelacakan kurir · notifikasi & email · banyak
dapur · varian dan topping · kupon dan diskon · ulasan · chat · aplikasi
mobile · Docker · CI · kunci idempotency · reset kata sandi · konsinyasi dan
pencatatan retur · beberapa pengiriman per hari

Alasan umum: tiap tambahan ini memberi sedikit sekali pelajaran baru per waktu
yang dihabiskan. Ini cara paling umum proyek pribadi mati.

Daftar ini bersifat **mengikat**. Menambah item ke ruang lingkup adalah
keputusan sadar yang mengubah dokumen ini, bukan sesuatu yang terjadi diam-diam
di tengah jalan.

---

## 3. Teknologi

```
React + Vite  →  HTTP/JSON  →  Express (Node.js)  →  SQL  →  PostgreSQL
```

| Bagian | Pilihan | Alasan |
|---|---|---|
| Bahasa | JavaScript (Node) | Sudah dikuasai. Satu hal baru pada satu waktu: konsep server, bukan sintaks. |
| Framework | Express | Kecil, tidak ajaib, seluruh alur bisa dibaca sendiri. |
| Database | PostgreSQL | Transaksi dan penguncian yang serius — inti pelajaran proyek ini. |
| Akses DB | SQL langsung, **tanpa ORM** | ORM menyembunyikan transaksi, penguncian, dan bentuk kueri — tepat tiga hal yang mau dipelajari. |
| Frontend | React + Vite, **bukan Next.js** | Next.js mengaburkan batas server/klien; batas itu justru yang sedang dipelajari. |
| Test | `node:test` bawaan | Tanpa dependency tambahan. |
| Hosting | Ditunda | Belum ada yang layak di-deploy. Keputusan infrastruktur prematur itu mahal. |

### Ditolak

- **Laravel/PHP** — pilihan terkuat di pasar kerja Indonesia, tapi berarti
  bahasa baru + framework besar penuh konvensi sekaligus. Setelah proyek ini,
  Laravel jauh lebih cepat dipelajari karena yang tersisa tinggal sintaks.
- **Supabase sebagai backend** — memakai auth dan API otomatisnya berarti
  mengkonfigurasi backend orang lain, bukan membangun backend. Boleh dipakai
  sebagai Postgres saja.
- **MongoDB** — membuat masalah kuota dan saldo lebih sulit tanpa memberi
  pelajaran sebagai gantinya.

---

## 4. Model Data

Delapan tabel.

### `users`
`id` · `email` (unik) · `password_hash` · `nama` (nama toko) · `pic`
(penanggung jawab di toko) · `telepon` · `alamat` (alamat toko) ·
`peran` (`toko` | `dapur`) · `saldo` (deposit, integer rupiah) · `dibuat_pada`

### `menu_items`
`id` · `nama` · `deskripsi` · `harga` (integer rupiah) · `aktif`

Katalog menu, terlepas dari tanggal.

### `service_days`
`tanggal` (PK) · `status` (`open` | `closed`) · `batas_waktu_pesan`
(timestamptz)

Satu baris per tanggal layanan.

### `daily_menu_items`
`id` · `tanggal` (FK) · `menu_item_id` (FK) · `harga` (snapshot) · `kuota` ·
`terjual`

Menu apa yang dimasak di tanggal itu dan berapa banyak. Unik pada
(`tanggal`, `menu_item_id`).

### `orders`
`id` · `user_id` · `tanggal_layanan` · `status` (`confirmed` | `cancelled` |
`delivered`) · `total` · `alamat_antar` (snapshot) · `dibuat_pada`

### `order_items`
`id` · `order_id` · `daily_menu_item_id` · `jumlah` · `harga_satuan` (snapshot)

### `credit_ledger`
`id` · `user_id` · `jumlah` (positif/negatif) · `jenis` (`topup` | `order` |
`refund`) · `ref_order_id` · `catatan` · `dibuat_pada`

Buku besar saldo. **Hanya boleh ditambah — tidak pernah diubah atau dihapus.**

### `topup_requests`
`id` · `user_id` · `nominal` · `catatan_bukti` · `status` (`pending` |
`approved` | `rejected`) · `ditinjau_oleh` · `ditinjau_pada`

### Empat keputusan dan alasannya

**1. Uang sebagai bilangan bulat rupiah, tidak pernah pecahan.**
`0.1 + 0.2` tidak menghasilkan `0.3` dalam aritmetika titik-mengambang. Ini
penyebab nyata selisih uang di sistem produksi. Rp 25.000 disimpan sebagai
`25000`.

**2. Snapshot, bukan referensi, untuk data historis.**
`order_items.harga_satuan` dan `orders.alamat_antar` menduplikasi data yang ada
di tabel lain — dan itu disengaja. Kalau harga naik bulan depan, riwayat
pesanan bulan lalu tidak boleh ikut berubah. Kalau pelanggan pindah rumah,
pesanan lama harus tetap tercatat di alamat lama. Pesanan adalah catatan
sejarah, bukan cerminan keadaan sekarang.

**3. Buku besar sebagai kebenaran, kolom saldo sebagai ringkasan.**
Setiap pergerakan saldo menjadi baris baru di `credit_ledger`. `users.saldo`
hanya ringkasan agar cepat dibaca. Keduanya wajib berubah dalam transaksi yang
sama. Sistem yang menyentuh uang tanpa jejak audit tidak bisa dipercaya.

**4. Aturan kritis ditegakkan di database, bukan hanya di kode.**

```sql
ALTER TABLE users
  ADD CONSTRAINT saldo_tidak_minus CHECK (saldo >= 0);

ALTER TABLE daily_menu_items
  ADD CONSTRAINT tidak_over_jual CHECK (terjual <= kuota);
```

Kode aplikasi bisa punya bug atau jalur yang terlewat diperiksa. Batasan
database adalah jaring pengaman terakhir yang tidak bisa dilewati siapa pun.

### Keputusan yang bisa ditinjau ulang

Saldo dipilih dalam **rupiah**, bukan dalam **porsi**. Alasannya: harga tiap
menu bisa berbeda, dan paket langganan tetap bisa dibuat (bayar Rp 450.000,
dapat saldo Rp 500.000, diskonnya terasa). Saldo berbasis porsi memaksa semua
menu seharga sama, dan itu mengikat model bisnis lebih ketat daripada yang
diputuskan di proposal kuliah.

---

## 5. Alur Pemesanan & Penguncian Kuota

Bagian terpenting di seluruh proyek.

### Alur

1. Periksa gerbang waktu: `service_days.status = 'open'` **dan**
   `now() < batas_waktu_pesan`
2. Ambil harga dari `daily_menu_items`, hitung total
3. Dalam **satu transaksi**:
   1. potong saldo (`users`)
   2. catat di `credit_ledger`
   3. klaim kuota (`daily_menu_items`)
   4. buat `orders` + `order_items`
4. Commit

Kegagalan di langkah mana pun me-rollback seluruhnya. Tidak ada saldo yang
terpotong tanpa pesanan, tidak ada kuota yang terklaim tanpa pembayaran.

### Masalah: race condition

Kode naif yang **salah**:

```sql
SELECT terjual, kuota FROM daily_menu_items WHERE id = 7;  -- 59, 60
```

```js
if (terjual + 1 <= kuota) {
  await db.query('UPDATE daily_menu_items SET terjual = terjual + 1 WHERE id = 7');
}
```

Dua permintaan bersamaan sama-sama membaca `59`, sama-sama lolos pemeriksaan,
sama-sama menulis — hasilnya `terjual = 61` padahal kuota `60`. Besok pagi
dapur kekurangan satu porsi.

Nama masalahnya: **read-modify-write race** (TOCTOU) — ada celah waktu antara
memeriksa dan menggunakan hasil pemeriksaan, dan di celah itu dunia berubah.

### Solusi: satukan pemeriksaan dan penulisan

```sql
UPDATE daily_menu_items
SET terjual = terjual + $2
WHERE id = $1
  AND terjual + $2 <= kuota
RETURNING terjual;
```

```js
if (result.rowCount === 0) throw new KuotaHabisError();
```

Yang diperiksa bukan isi baris, melainkan **berapa baris yang berubah**.

Satu pernyataan `UPDATE` mengunci baris yang disentuhnya. Permintaan kedua
menunggu sampai yang pertama selesai, lalu mengevaluasi ulang `WHERE` terhadap
nilai terbaru — syarat gagal, nol baris berubah, ditolak dengan benar. Tidak
ada celah, karena memeriksa dan menulis adalah satu operasi yang tidak bisa
disela.

Pola yang sama untuk saldo:

```sql
UPDATE users
SET saldo = saldo - $2
WHERE id = $1 AND saldo >= $2
RETURNING saldo;
```

`CHECK` **tidak menggantikan** kueri bersyarat ini. `CHECK` adalah jaring
pengaman kalau kode salah; kueri bersyarat adalah cara kode menjadi benar.
Keduanya dipakai bersamaan.

### Urutan penguncian

**Aturan wajib: kunci sumber daya selalu dalam urutan yang sama** di semua
jalur kode — baris `users` dulu, lalu `daily_menu_items` urut `id` menaik.
Melanggar ini menyebabkan **deadlock**: transaksi A mengunci baris 5 lalu ingin
9, B mengunci 9 lalu ingin 5, keduanya saling menunggu sampai Postgres membunuh
salah satunya.

**Kenapa saldo dipotong sebelum kuota diklaim**, padahal keduanya di transaksi
yang sama sehingga hasil akhirnya identik: baris `daily_menu_items` adalah
**baris panas** — semua pelanggan yang memesan menu itu di tanggal itu
memperebutkan baris yang sama. Baris `users` hanya diperebutkan oleh satu
pelanggan. Kunci pada baris panas harus dipegang **sesingkat mungkin**, jadi
diklaim paling akhir, sedekat mungkin dengan commit. Bonusnya: pesanan yang
gagal karena saldo kurang ditolak sebelum menyentuh baris panas sama sekali.

### `SELECT ... FOR UPDATE`

Alternatif yang mengunci baris secara eksplisit sampai transaksi selesai. Lebih
fleksibel untuk logika bercabang, lebih mudah salah, dan lebih rawan deadlock.
**Tidak dipakai di MVP** — cukup dikenali keberadaannya.

### Tingkat isolasi

Default PostgreSQL (`READ COMMITTED`) sudah cukup dengan pola kueri bersyarat
di atas. Tidak perlu `SERIALIZABLE`.

### Waktu

- Waktu sekarang **selalu** dari server atau database, tidak pernah dari klien.
  Klien bisa mengubah jamnya lewat DevTools dan memesan setelah dapur tutup.
- Simpan sebagai `timestamptz`.
- "Tanggal layanan" adalah tanggal di zona **Asia/Jakarta**, bukan UTC. Server
  yang berjalan di UTC akan mengira hari berganti pukul 07:00 WIB kalau ini
  diabaikan.

### Pembatalan

Hanya diizinkan sebelum batas waktu pesan. Dalam satu transaksi, dengan urutan
kunci yang sama: kembalikan saldo → catat `refund` di buku besar →
`terjual = terjual - jumlah` → ubah status pesanan jadi `cancelled`.

**Baris pesanan tidak pernah dihapus**, hanya diubah statusnya. Pesanan yang
dibatalkan adalah informasi, bukan sampah — dan menghapus catatan yang
menyentuh uang adalah kebiasaan buruk.

---

## 6. Autentikasi & Otorisasi

### Sesi berbasis cookie, bukan JWT

Cookie `httpOnly` + tabel `sessions` di database.

Alasan menolak JWT di `localStorage`, pola yang paling banyak diajarkan
tutorial:

- token di `localStorage` bisa dibaca skrip mana pun di halaman itu, jadi
  rentan terhadap XSS
- JWT tidak bisa dicabut sebelum kedaluwarsa; sesi di database bisa dihapus
  seketika saat logout atau saat akun bermasalah

Konsekuensi yang harus disadari sejak awal: frontend dan backend berada di asal
(origin) yang berbeda, jadi perlu konfigurasi **CORS** dengan
`credentials: true` dan daftar origin eksplisit, serta atribut cookie
`SameSite` yang tepat. Ini akan membuat frustrasi selama beberapa jam. Itu
normal, dan CORS memang materi yang wajib dikuasai.

### Kata sandi

`bcrypt` dengan cost factor wajar. Tidak pernah plaintext, tidak pernah MD5 atau
SHA polos. Salt ditangani bcrypt secara otomatis — jangan membuat sendiri.

### Otorisasi

Dua lapis middleware:

- `requireAuth` — ada sesi yang sah
- `requireRole('kitchen')` — untuk endpoint dapur

Dan satu aturan yang paling sering dilupakan pemula: **pemeriksaan
kepemilikan**. Pelanggan A tidak boleh membaca `/api/orders/123` milik
pelanggan B hanya karena sudah masuk. Kerentanan ini bernama **IDOR** (Insecure
Direct Object Reference), sangat umum di aplikasi buatan pemula, dan wajib ada
test-nya di proyek ini.

---

## 7. Bentuk API

Bentuk error konsisten di seluruh endpoint:

```json
{ "error": { "code": "KUOTA_HABIS", "message": "Porsi untuk tanggal ini sudah habis." } }
```

Kode HTTP: `409` kuota habis · `409` saldo kurang · `403` lewat batas waktu ·
`403` bukan pemilik · `401` belum masuk · `422` input tidak valid.

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/menu?tanggal=YYYY-MM-DD      menu, sisa kuota, batas waktu
POST   /api/orders                        buat pesanan
GET    /api/orders                        pesanan saya
GET    /api/orders/:id
POST   /api/orders/:id/cancel
GET    /api/balance                       saldo + riwayat buku besar
POST   /api/topups                        ajukan pengisian saldo

--- peran kitchen ---
POST   /api/kitchen/service-days          buka tanggal + kuota + batas waktu
GET    /api/kitchen/production?tanggal=   daftar produksi
GET    /api/kitchen/deliveries?tanggal=   daftar antar
GET    /api/kitchen/topups
POST   /api/kitchen/topups/:id/approve
POST   /api/kitchen/topups/:id/reject
```

Enam belas endpoint. Cukup untuk lingkaran penuh, tidak lebih.

---

## 8. Struktur Proyek

```
rantang/
  server/
    src/
      db.js              koneksi pool + helper transaksi
      errors.js          kelas error domain
      auth.js            sesi, hash, middleware
      routes/            terjemahan HTTP <-> fungsi
      services/
        order.js         INTI: pesan, batal, kuota, saldo
        menu.js
        topup.js
    migrations/          001_init.sql, 002_....sql
    tests/
    package.json
  web/                   React + Vite
  docs/
  README.md
```

**Prinsip: logika bisnis tidak berada di dalam route handler.** Route hanya
menerjemahkan HTTP ke pemanggilan fungsi dan menerjemahkan error domain ke kode
HTTP. `services/order.js` harus bisa dites tanpa menyentuh HTTP sama sekali —
itulah yang membuat test race condition mudah ditulis.

**Migrasi:** berkas SQL bernomor yang dijalankan berurutan, dengan tabel
`schema_migrations` sebagai pencatat. Skrip pelaksananya ditulis sendiri
(sekitar 30 baris), bukan memakai alat migrasi pihak ketiga — nilai belajarnya
ada di situ, dan setelah paham, alat siap pakai tinggal dipilih kapan saja.

---

## 9. Strategi Test

Memakai **database test sungguhan**, bukan mock. Race condition tidak bisa
di-mock; mem-mock database di proyek ini akan menghapus justru pelajarannya.

Yang wajib ada test-nya:

1. **Kuota tidak bisa dilewati** — kuota tersisa 1, tembakkan 20 permintaan
   pemesanan bersamaan dari 20 koneksi berbeda; tepat 1 berhasil, 19 ditolak,
   dan `terjual === kuota`.
2. **Saldo tidak bisa minus** — pola serupa dengan pemesanan bersamaan.
3. **Batas waktu ditegakkan** — pesanan setelah cutoff ditolak.
4. **Kepemilikan** — pelanggan A tidak bisa membaca atau membatalkan pesanan
   pelanggan B.
5. **Pembatalan mengembalikan kuota dan saldo** dengan tepat.
6. **Buku besar seimbang** — `SUM(credit_ledger.jumlah)` sama dengan
   `users.saldo`.

Bukan target: cakupan 100%.

**Disarankan:** tulis test nomor 1 lebih dulu terhadap versi naif yang salah,
dan saksikan sendiri kuotanya jebol. Melihat bug-nya terjadi jauh lebih
berkesan daripada membaca penjelasannya.

---

## 10. Rencana Bertahap

| Fase | Isi |
|---|---|
| 0 | Node + PostgreSQL lokal, repo, skrip migrasi, koneksi pertama |
| 1 | Skema lengkap + migrasi + data contoh |
| 2 | Auth: daftar, masuk, sesi, peran, middleware |
| 3 | Menu & tanggal layanan (sisi dapur sederhana) |
| 4 | **Pemesanan: kuota, saldo, transaksi, test race** |
| 5 | Pembatalan, buku besar, pengisian saldo manual |
| 6 | Dasbor dapur: daftar produksi & daftar antar |
| 7 | Frontend React untuk kedua peran |
| 8 | README, rekaman layar, rapikan |
| Bonus | Deploy, bila memungkinkan tanpa biaya |

**Semua fase 0–8 selesai per 8 September 2026**, ditambah satu revisi tak
terencana: perpindahan model bisnis ke jalur ritel (lihat Catatan revisi di
bagian 1). Yang tersisa hanya rekaman layar demo dan deploy — keduanya bonus.

**Fase 4 adalah alasan seluruh proyek ini ada.** Jangan terburu-buru sampai ke
sana lalu berhenti, dan jangan tergoda melompatinya karena terasa sulit.

Estimasi durasi sengaja tidak dicantumkan. Estimasi dari luar untuk proyek
belajar hampir selalu meleset, dan satu-satunya efeknya adalah menciptakan rasa
tertinggal.

---

## 11. Risiko

| Risiko | Penanganan |
|---|---|
| Proyek mati di sekitar 60%, tepat sebelum bagian yang bernilai | Fase 4 sengaja ditaruh di tengah, bukan di akhir |
| Ruang lingkup meledak | Daftar "tidak dibangun" di bagian 2 bersifat mengikat |
| Tiga front terbuka (portfolio v2, kuliah, proyek ini) | Perlu keputusan sadar soal urutan pengerjaan |
| Frustrasi CORS dan cookie | Diantisipasi; wajar, dan memang materi yang harus dikuasai |
| Bug zona waktu | Aturan `timestamptz` + Asia/Jakarta ditetapkan sejak awal |
| Tanpa hosting berbayar | Repo yang bisa dijalankan orang lain + rekaman layar dijadikan target utama, deploy jadi bonus |

---

## 12. Langkah Berikutnya

Setelah spec ini ditinjau dan disetujui: susun rencana implementasi terperinci,
lalu mulai Fase 0.
