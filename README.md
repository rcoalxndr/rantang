# Rantang — Sistem Pemesanan Prabayar

Sistem pemesanan untuk **Rantang**, konsep bisnis makanan siap-santap bergizi
seimbang dari tugas mata kuliah Kewirausahaan. Bisnisnya belum berjalan;
perangkat lunaknya nyata.

Dibangun sebagai proyek belajar backend: transaksi database, penguncian baris,
dan race condition pada kuota produksi harian.

## Model

Dapur hanya memasak sebanyak yang sudah dipesan. Pelanggan mengisi saldo di
muka, memesan untuk tanggal tertentu sebelum batas waktu, dan dapur membuka
daftar produksi setiap pagi.

## Teknologi

```
React + Vite → HTTP/JSON → Express (Node) → SQL langsung → PostgreSQL
```

Sengaja tanpa ORM: transaksi, penguncian baris, dan bentuk kueri adalah inti
pelajaran proyek ini, dan ORM menyembunyikan ketiganya.

## Menjalankan secara lokal

Prasyarat: Node 22+, PostgreSQL 16+.

Buat dua database:

```bash
psql -U postgres -c "CREATE DATABASE rantang_dev;"
psql -U postgres -c "CREATE DATABASE rantang_test;"
```

Siapkan konfigurasi dan jalankan migrasi:

```bash
cd server
cp .env.example .env
# sunting .env, isi kata sandi PostgreSQL milikmu
npm install
npm run migrate
npm run seed
```

Seed membuat tiga akun contoh — `dapur@rantang.test` (peran dapur),
`rico@contoh.test`, `sinta@contoh.test` — semuanya dengan kata sandi
`rantang-demo-2026`. Hanya untuk database pengembangan di mesin sendiri.

## Test

```bash
cd server
cp .env.example .env.test
# sunting .env.test: isi kata sandi, dan ganti nama database jadi rantang_test
npm run migrate:test
npm test
```

Test dijalankan serial (`--test-concurrency=1`). Ketiga berkas test berbagi
satu database dan saling menimpa kalau berjalan paralel.

## Struktur

```
server/
  src/db.js          koneksi pool + helper transaksi
  migrations/        berkas SQL bernomor, dijalankan berurutan
  scripts/migrate.js pelaksana migrasi + pencatat versi
  scripts/seed.js    data contoh
  tests/
docs/
  superpowers/specs/ desain
  superpowers/plans/ rencana implementasi
```

## Dokumen

- Desain: `docs/superpowers/specs/2026-09-07-rantang-pemesanan-design.md`
- Rencana Fase 0–1: `docs/superpowers/plans/2026-09-07-fase-0-1-fondasi.md`
- Catatan Fase 2: `docs/superpowers/plans/2026-09-07-fase-2-auth.md`
- Panduan Fase 4: `docs/superpowers/plans/2026-09-07-fase-4-pemesanan.md`

## Menjalankan server

```bash
cd server
npm run dev      # dengan auto-reload
npm start        # tanpa auto-reload
```

Server jalan di `http://localhost:3000`. Cek cepat: `curl http://localhost:3000/api/health`

## Status

**Fase 0–1 — fondasi data.** Skema 8 tabel, migrasi SQL bernomor, dan test yang
membuktikan PostgreSQL menolak saldo minus, over-jual, peran tak dikenal,
status tak dikenal, email ganda, dan penghapusan user yang punya riwayat
pesanan.

**Fase 2 — autentikasi.** Hash kata sandi dengan `crypto.scrypt` bawaan Node
(bergaram, dibandingkan waktu-tetap), sesi acak di database, cookie `httpOnly`,
middleware peran, CORS ditulis sendiri. Endpoint: `register`, `login`,
`logout`, `me`.

**Fase 3 — menu & tanggal layanan.** Dapur mengelola katalog menu, membuka
tanggal layanan dengan kuota dan batas waktu, serta menutupnya. Pelanggan (dan
siapa pun) bisa melihat menu per tanggal beserta sisa porsi. Harga di-snapshot
per tanggal sehingga perubahan harga katalog tidak mengubah tanggal yang sudah
dibuka.

**Fase 4 — inti pemesanan.** Kuota, saldo, transaksi, pembatalan. Pemeriksaan
dan penulisan disatukan dalam satu `UPDATE ... WHERE` sehingga tidak ada celah
antara keduanya; uji perebutan dibuktikan mendeteksi versi naif.

**Fase 5 — saldo prabayar.** Pengisian saldo lewat transfer manual yang
dikonfirmasi dapur, buku besar sebagai sumber kebenaran, dan endpoint HTTP
untuk seluruh alur pelanggan.

**Fase 6 — dasbor dapur.** Daftar produksi harian (berapa porsi tiap menu yang
harus dimasak) dan daftar antar (siapa, ke mana, apa isinya), plus penandaan
pesanan terkirim. Jumlah produksi dihitung ulang dari pesanan yang sebenarnya,
bukan dibaca dari kolom `terjual` — ada test yang menjaga keduanya selalu sama.

159 test lulus.

Berikutnya: frontend React untuk kedua peran (Fase 7).
