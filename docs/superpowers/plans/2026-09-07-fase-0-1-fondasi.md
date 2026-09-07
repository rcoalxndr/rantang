# Rantang — Rencana Implementasi Fase 0 & 1 (Fondasi)

> **Catatan penting:** Rencana ini ditulis untuk **dikerjakan Rico sendiri**,
> bukan didelegasikan ke agen. Ini proyek belajar — mengotomasi pengerjaannya
> menghapus alasan proyek ini ada. Claude berperan menjelaskan, meninjau, dan
> membantu saat macet.

**Tujuan:** Lingkungan pengembangan berjalan, skema database lengkap
ter-migrasi, dan ada test yang membuktikan batasan kritis benar-benar
ditegakkan oleh PostgreSQL.

**Arsitektur:** Node.js (ESM) + Express + PostgreSQL dengan SQL langsung.
Migrasi berupa berkas SQL bernomor yang dijalankan skrip buatan sendiri, tiap
migrasi berjalan dalam satu transaksi. Test memakai `node:test` bawaan dan
database test terpisah.

**Tech stack:** Node 24 · PostgreSQL 16/17 · `pg` (satu-satunya dependency di
fase ini) · `node:test`

**Spec:** `docs/superpowers/specs/2026-09-07-rantang-pemesanan-design.md`

## Batasan Global

- Uang selalu **integer rupiah** (`BIGINT`), tidak pernah pecahan.
- Waktu selalu `TIMESTAMPTZ`. Tanggal layanan adalah tanggal **Asia/Jakarta**.
- Aturan kritis ditegakkan sebagai `CHECK` di database, bukan hanya di kode.
- Baris yang menyentuh uang atau riwayat **tidak pernah dihapus**, hanya
  diubah statusnya.
- Kata sandi database dan berkas `.env` **tidak pernah masuk git**.
- Modul memakai ESM (`"type": "module"`).
- Tidak menambah dependency di luar `pg` selama fase ini.

---

# FASE 0 — Lingkungan

## Task 0.1: Pasang PostgreSQL dan siapkan dua database

**Dikerjakan Rico sendiri.** Claude tidak memasang perangkat lunak dan tidak
menerima kata sandi.

**Berkas:** tidak ada.

**Interfaces:**
- Produces: database `rantang_dev` dan `rantang_test` di `localhost:5432`,
  serta kata sandi superuser yang hanya Rico yang tahu.

- [ ] **Langkah 1: Unduh dan pasang PostgreSQL**

Ambil installer Windows dari `https://www.postgresql.org/download/windows/`
(installer EDB). Versi 16 atau 17 sama-sama cocok.

Saat pemasangan:
- Installer meminta **kata sandi superuser `postgres`**. Buat kata sandi
  sendiri dan simpan di pengelola kata sandi. **Jangan pernah menempelkannya
  ke chat, ke kode, atau ke git.**
- Biarkan port di `5432`.
- Komponen `pgAdmin 4` boleh ikut dipasang; berguna untuk melihat isi tabel.

- [ ] **Langkah 2: Pastikan `psql` bisa dipanggil dari terminal**

Tambahkan folder `bin` PostgreSQL ke PATH — biasanya:

```
C:\Program Files\PostgreSQL\17\bin
```

Tutup dan buka lagi terminal, lalu:

```bash
psql --version
```

Harapan: muncul `psql (PostgreSQL) 17.x`. Kalau `command not found`, PATH-nya
belum benar.

- [ ] **Langkah 3: Buat dua database**

```bash
psql -U postgres -c "CREATE DATABASE rantang_dev;"
```

```bash
psql -U postgres -c "CREATE DATABASE rantang_test;"
```

Masing-masing akan meminta kata sandi yang tadi dibuat.

**Kenapa dua database:** test akan menghapus isi tabel berulang kali. Kalau
test menunjuk ke database yang sama dengan pengembangan, data contohmu akan
hilang tiap kali test dijalankan — dan lebih buruk, suatu hari kamu akan
menjalankan test menunjuk ke database sungguhan. Pemisahan ini kebiasaan yang
harus terbentuk sejak awal.

- [ ] **Langkah 4: Verifikasi**

```bash
psql -U postgres -l
```

Harapan: `rantang_dev` dan `rantang_test` muncul di daftar.

---

## Task 0.2: Inisialisasi proyek Node dan konfigurasi

**Berkas:**
- Buat: `server/package.json`
- Buat: `server/.env`, `server/.env.test`, `server/.env.example`
- Buat: `.gitignore`

**Interfaces:**
- Produces: `process.env.DATABASE_URL` tersedia lewat `node --env-file`;
  perintah npm `migrate`, `seed`, `test`.

- [ ] **Langkah 1: Buat `.gitignore` di akar repo**

```gitignore
node_modules/
.env
.env.test
*.log
dist/
```

- [ ] **Langkah 2: Buat `server/package.json`**

```json
{
  "name": "rantang-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "migrate": "node --env-file=.env scripts/migrate.js",
    "migrate:test": "node --env-file=.env.test scripts/migrate.js",
    "seed": "node --env-file=.env scripts/seed.js",
    "test": "node --env-file=.env.test --test --test-concurrency=1"
  },
  "dependencies": {
    "pg": "^8.13.0"
  }
}
```

**Kenapa `"type": "module"`:** memakai `import`/`export` yang sama dengan
React nanti, jadi kamu tidak perlu berpindah antara dua gaya modul di satu
proyek.

**Kenapa tidak ada `dotenv`:** Node 24 sudah bisa membaca berkas `.env`
sendiri lewat `--env-file`. Satu dependency yang tidak perlu ditambahkan.

- [ ] **Langkah 3: Buat `server/.env.example` (ini yang masuk git)**

```
DATABASE_URL=postgres://postgres:GANTI_DENGAN_KATA_SANDIMU@localhost:5432/rantang_dev
```

- [ ] **Langkah 4: Buat `server/.env` dan `server/.env.test` (tidak masuk git)**

`server/.env`:

```
DATABASE_URL=postgres://postgres:KATA_SANDI_ASLIMU@localhost:5432/rantang_dev
```

`server/.env.test`:

```
DATABASE_URL=postgres://postgres:KATA_SANDI_ASLIMU@localhost:5432/rantang_test
```

- [ ] **Langkah 5: Pasang dependency**

```bash
cd server && npm install
```

- [ ] **Langkah 6: Pastikan `.env` benar-benar tidak terlacak git**

```bash
git status --short
```

Harapan: `server/.env` dan `server/.env.test` **tidak muncul**. Kalau muncul,
`.gitignore` salah tempat — perbaiki sebelum melanjutkan.

- [ ] **Langkah 7: Commit**

```bash
git add .gitignore server/package.json server/package-lock.json server/.env.example
git commit -m "chore: inisialisasi proyek server Node + konfigurasi env"
```

---

## Task 0.3: Koneksi database dan helper transaksi

**Berkas:**
- Buat: `server/src/db.js`
- Buat: `server/tests/db.test.js`

**Interfaces:**
- Produces: `pool` (objek Pool dari `pg`), dan
  `withTransaction(fn) -> Promise<T>` yang menjalankan `fn(client)` di dalam
  `BEGIN`/`COMMIT`, dan `ROLLBACK` bila `fn` melempar error.

- [ ] **Langkah 1: Tulis test yang gagal**

`server/tests/db.test.js`:

```js
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, withTransaction } from '../src/db.js';

after(async () => {
  await pool.end();
});

test('pool bisa terhubung ke database', async () => {
  const { rows } = await pool.query('SELECT 1 AS satu');
  assert.equal(rows[0].satu, 1);
});

test('withTransaction meng-commit saat berhasil', async () => {
  await pool.query('DROP TABLE IF EXISTS coba_transaksi');
  await pool.query('CREATE TABLE coba_transaksi (nilai INT)');

  await withTransaction(async (client) => {
    await client.query('INSERT INTO coba_transaksi (nilai) VALUES (1)');
  });

  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM coba_transaksi');
  assert.equal(rows[0].n, 1);
  await pool.query('DROP TABLE coba_transaksi');
});

test('withTransaction me-rollback saat gagal', async () => {
  await pool.query('DROP TABLE IF EXISTS coba_transaksi');
  await pool.query('CREATE TABLE coba_transaksi (nilai INT)');

  await assert.rejects(() =>
    withTransaction(async (client) => {
      await client.query('INSERT INTO coba_transaksi (nilai) VALUES (1)');
      throw new Error('sengaja gagal');
    })
  );

  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM coba_transaksi');
  assert.equal(rows[0].n, 0, 'baris seharusnya tidak tersimpan setelah rollback');
  await pool.query('DROP TABLE coba_transaksi');
});
```

- [ ] **Langkah 2: Jalankan dan pastikan gagal**

```bash
cd server && npm test
```

Harapan: GAGAL dengan `Cannot find module '../src/db.js'`.

- [ ] **Langkah 3: Tulis implementasi minimal**

`server/src/db.js`:

```js
import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL belum diset. Jalankan lewat npm script yang memakai --env-file.');
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hasil = await fn(client);
    await client.query('COMMIT');
    return hasil;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

**Kenapa `import pg from 'pg'` lalu di-destructure:** paket `pg` masih
CommonJS. Mengambil default export lalu membongkarnya selalu bekerja;
`import { Pool } from 'pg'` kadang bekerja kadang tidak, tergantung versi.

**Kenapa `finally { client.release() }`:** koneksi wajib dikembalikan ke pool
apa pun yang terjadi. Lupa melakukan ini adalah penyebab paling umum aplikasi
Node "menggantung" setelah beberapa jam — pool kehabisan koneksi dan semua
permintaan menunggu selamanya.

- [ ] **Langkah 4: Jalankan test, pastikan lulus**

```bash
cd server && npm test
```

Harapan: 3 test LULUS.

- [ ] **Langkah 5: Commit**

```bash
git add server/src/db.js server/tests/db.test.js
git commit -m "feat: koneksi database dan helper transaksi"
```

---

## Task 0.4: Skrip migrasi

**Berkas:**
- Buat: `server/scripts/migrate.js`
- Buat: `server/migrations/000_schema_migrations.sql`
- Buat: `server/tests/migrate.test.js`

**Interfaces:**
- Consumes: `pool` dari `src/db.js`
- Produces: perintah `npm run migrate`, tabel `schema_migrations(versi,
  dijalankan_pada)`, dan aturan penamaan berkas migrasi `NNN_nama.sql`.

- [ ] **Langkah 1: Tulis test yang gagal**

`server/tests/migrate.test.js`:

```js
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { jalankanMigrasi } from '../scripts/migrate.js';

after(async () => {
  await pool.end();
});

test('migrasi membuat tabel schema_migrations', async () => {
  await jalankanMigrasi();
  const { rows } = await pool.query(`SELECT to_regclass('schema_migrations') AS ada`);
  assert.ok(rows[0].ada, 'tabel schema_migrations seharusnya sudah ada');
});

test('migrasi bersifat idempoten', async () => {
  await jalankanMigrasi();
  const pertama = await pool.query('SELECT COUNT(*)::int AS n FROM schema_migrations');
  await jalankanMigrasi();
  const kedua = await pool.query('SELECT COUNT(*)::int AS n FROM schema_migrations');
  assert.equal(kedua.rows[0].n, pertama.rows[0].n,
    'menjalankan migrasi dua kali tidak boleh menambah catatan');
});
```

- [ ] **Langkah 2: Jalankan dan pastikan gagal**

```bash
cd server && npm test
```

Harapan: GAGAL dengan `Cannot find module '../scripts/migrate.js'`.

- [ ] **Langkah 3: Tulis skrip migrasi**

`server/scripts/migrate.js`:

```js
import { readdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { pool } from '../src/db.js';

const DIR = new URL('../migrations/', import.meta.url);

export async function jalankanMigrasi() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      versi           TEXT PRIMARY KEY,
      dijalankan_pada TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await pool.query('SELECT versi FROM schema_migrations');
  const sudah = new Set(rows.map((r) => r.versi));

  const berkas = (await readdir(DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const nama of berkas) {
    if (sudah.has(nama)) continue;

    const sql = await readFile(new URL(nama, DIR), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (versi) VALUES ($1)', [nama]);
      await client.query('COMMIT');
      console.log(`  ok  ${nama}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  GAGAL  ${nama}`);
      throw err;
    } finally {
      client.release();
    }
  }
}

// Hanya dijalankan kalau berkas ini dipanggil langsung, bukan saat di-import test.
// pathToFileURL wajib dipakai di sini: di Windows, process.argv[1] berbentuk
// "C:\...\migrate.js" sedangkan import.meta.url berbentuk "file:///C:/.../migrate.js".
// Membandingkan keduanya secara manual akan selalu gagal, dan akibatnya
// `npm run migrate` akan diam saja tanpa error.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  jalankanMigrasi()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
```

**Kenapa tiap migrasi dibungkus transaksi:** PostgreSQL mendukung *DDL
transaksional* — `CREATE TABLE` pun bisa di-rollback. Artinya kalau satu
berkas migrasi berisi lima perintah dan yang keempat gagal, database kembali
persis seperti sebelum berkas itu dijalankan. Tidak ada keadaan setengah jadi
yang harus kamu bereskan manual. Banyak database lain (MySQL, misalnya) tidak
bisa begini, dan ini salah satu alasan nyata memilih Postgres.

**Kenapa nama berkas di-`sort()`:** urutan migrasi harus deterministik.
Penomoran `001_`, `002_` memastikan urutannya sama di mesin mana pun.

- [ ] **Langkah 4: Buat berkas migrasi kosong pertama**

`server/migrations/000_schema_migrations.sql`:

```sql
-- Berkas ini sengaja hampir kosong.
-- Tabel schema_migrations dibuat oleh skrip migrasi itu sendiri, karena
-- skrip perlu tabel itu untuk tahu migrasi mana yang sudah jalan.
-- Berkas ini ada supaya folder migrations tidak kosong dan penomoran dimulai
-- dari titik yang jelas.
SELECT 1;
```

- [ ] **Langkah 5: Jalankan test, pastikan lulus**

```bash
cd server && npm run migrate:test && npm test
```

Harapan: 2 test migrasi LULUS.

- [ ] **Langkah 6: Jalankan migrasi ke database pengembangan**

```bash
cd server && npm run migrate
```

Harapan: keluar baris `ok  000_schema_migrations.sql`.

- [ ] **Langkah 7: Commit**

```bash
git add server/scripts/migrate.js server/migrations/ server/tests/migrate.test.js
git commit -m "feat: skrip migrasi SQL bernomor dengan pencatat versi"
```

---

# FASE 1 — Skema Database

## Task 1.1: Migrasi 001 — `users` dan `sessions`

**Berkas:**
- Buat: `server/migrations/001_users.sql`
- Buat: `server/tests/helper.js`
- Buat: `server/tests/skema_users.test.js`

**Interfaces:**
- Produces: tabel `users` dan `sessions`; helper test
  `resetDatabase()` yang mengosongkan semua tabel data.

- [ ] **Langkah 1: Tulis test yang gagal**

`server/tests/helper.js`:

```js
import { pool } from '../src/db.js';

const TABEL_DATA = [
  'order_items',
  'orders',
  'credit_ledger',
  'topup_requests',
  'daily_menu_items',
  'service_days',
  'menu_items',
  'sessions',
  'users',
];

export async function resetDatabase() {
  const ada = [];
  for (const t of TABEL_DATA) {
    const { rows } = await pool.query('SELECT to_regclass($1) AS ada', [t]);
    if (rows[0].ada) ada.push(t);
  }
  if (ada.length === 0) return;
  await pool.query(`TRUNCATE ${ada.join(', ')} RESTART IDENTITY CASCADE`);
}
```

`server/tests/skema_users.test.js`:

```js
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { resetDatabase } from './helper.js';

after(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDatabase();
});

async function buatUser(saldo = 0, peran = 'customer') {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, nama, alamat, peran, saldo)
     VALUES ($1, 'hash-sementara', 'Uji', 'Jl. Uji No. 1', $2, $3)
     RETURNING id, saldo, peran`,
    [`uji-${Date.now()}-${Math.random()}@contoh.test`, peran, saldo]
  );
  return rows[0];
}

test('user baru bisa dibuat dengan saldo nol', async () => {
  const user = await buatUser();
  assert.equal(Number(user.saldo), 0);
  assert.equal(user.peran, 'customer');
});

test('saldo tidak boleh minus', async () => {
  await assert.rejects(
    () => buatUser(-1),
    (err) => err.code === '23514',
    'seharusnya ditolak oleh CHECK constraint (kode 23514)'
  );
});

test('saldo tidak bisa dibuat minus lewat UPDATE', async () => {
  const user = await buatUser(10000);
  await assert.rejects(
    () => pool.query('UPDATE users SET saldo = saldo - $1 WHERE id = $2', [20000, user.id]),
    (err) => err.code === '23514'
  );
});

test('peran selain customer/kitchen ditolak', async () => {
  await assert.rejects(
    () => buatUser(0, 'admin'),
    (err) => err.code === '23514'
  );
});

test('email harus unik', async () => {
  await pool.query(
    `INSERT INTO users (email, password_hash, nama) VALUES ('sama@contoh.test','h','A')`
  );
  await assert.rejects(
    () => pool.query(
      `INSERT INTO users (email, password_hash, nama) VALUES ('sama@contoh.test','h','B')`
    ),
    (err) => err.code === '23505',
    'seharusnya ditolak oleh UNIQUE constraint (kode 23505)'
  );
});
```

- [ ] **Langkah 2: Jalankan dan pastikan gagal**

```bash
cd server && npm test
```

Harapan: GAGAL karena relasi `users` belum ada (kode error `42P01`).

- [ ] **Langkah 3: Tulis migrasi**

`server/migrations/001_users.sql`:

```sql
CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  nama          TEXT        NOT NULL,
  telepon       TEXT        NOT NULL DEFAULT '',
  alamat        TEXT        NOT NULL DEFAULT '',
  peran         TEXT        NOT NULL DEFAULT 'customer',
  saldo         BIGINT      NOT NULL DEFAULT 0,
  dibuat_pada   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT peran_valid       CHECK (peran IN ('customer', 'kitchen')),
  CONSTRAINT saldo_tidak_minus CHECK (saldo >= 0)
);

CREATE TABLE sessions (
  id          TEXT        PRIMARY KEY,
  user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
  kedaluwarsa TIMESTAMPTZ NOT NULL
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
```

**Kenapa `saldo` bertipe `BIGINT`, bukan `INTEGER`:** `INTEGER` mentok di
sekitar 2,1 miliar. Dalam rupiah itu cuma Rp 2,1 miliar — dan lebih penting,
menyimpan uang di tipe yang bisa meluap adalah kelalaian yang tidak ada
untungnya. `BIGINT` gratis.

**Kenapa `ON DELETE CASCADE` di `sessions` tapi tidak di tabel lain:** sesi
adalah data sementara yang memang tidak berarti tanpa pemiliknya. Pesanan dan
buku besar sebaliknya — itu catatan sejarah dan tidak boleh ikut terhapus.

- [ ] **Langkah 4: Jalankan migrasi dan test**

```bash
cd server && npm run migrate:test && npm test
```

Harapan: 5 test skema LULUS. Perhatikan kode error `23514` — itu
`check_violation` dari PostgreSQL, bukti batasanmu benar-benar bekerja.

- [ ] **Langkah 5: Migrasi database pengembangan lalu commit**

```bash
cd server && npm run migrate
```

```bash
git add server/migrations/001_users.sql server/tests/helper.js server/tests/skema_users.test.js
git commit -m "feat: tabel users dan sessions dengan batasan saldo dan peran"
```

---

## Task 1.2: Migrasi 002 — menu dan tanggal layanan

**Berkas:**
- Buat: `server/migrations/002_menu.sql`
- Buat: `server/tests/skema_menu.test.js`

**Interfaces:**
- Consumes: `resetDatabase()` dari `tests/helper.js`
- Produces: tabel `menu_items`, `service_days`, `daily_menu_items`

- [ ] **Langkah 1: Tulis test yang gagal**

`server/tests/skema_menu.test.js`:

```js
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { resetDatabase } from './helper.js';

after(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDatabase();
});

async function siapkanMenuHarian(kuota = 10) {
  const menu = await pool.query(
    `INSERT INTO menu_items (nama, deskripsi, harga)
     VALUES ('Katsu Ayam Saus Rendang', 'Menu uji', 32000) RETURNING id`
  );
  await pool.query(
    `INSERT INTO service_days (tanggal, batas_waktu_pesan)
     VALUES (DATE '2026-10-01', TIMESTAMPTZ '2026-09-30 20:00:00+07')`
  );
  const harian = await pool.query(
    `INSERT INTO daily_menu_items (tanggal, menu_item_id, harga, kuota)
     VALUES (DATE '2026-10-01', $1, 32000, $2) RETURNING id`,
    [menu.rows[0].id, kuota]
  );
  return { menuId: menu.rows[0].id, harianId: harian.rows[0].id };
}

test('menu harian bisa dibuat dengan terjual nol', async () => {
  const { harianId } = await siapkanMenuHarian();
  const { rows } = await pool.query(
    'SELECT terjual, kuota FROM daily_menu_items WHERE id = $1', [harianId]
  );
  assert.equal(rows[0].terjual, 0);
  assert.equal(rows[0].kuota, 10);
});

test('terjual tidak boleh melebihi kuota', async () => {
  const { harianId } = await siapkanMenuHarian(10);
  await assert.rejects(
    () => pool.query('UPDATE daily_menu_items SET terjual = 11 WHERE id = $1', [harianId]),
    (err) => err.code === '23514',
    'over-jual seharusnya ditolak database'
  );
});

test('terjual boleh tepat sama dengan kuota', async () => {
  const { harianId } = await siapkanMenuHarian(10);
  await pool.query('UPDATE daily_menu_items SET terjual = 10 WHERE id = $1', [harianId]);
  const { rows } = await pool.query(
    'SELECT terjual FROM daily_menu_items WHERE id = $1', [harianId]
  );
  assert.equal(rows[0].terjual, 10);
});

test('satu menu tidak boleh didaftarkan dua kali di tanggal yang sama', async () => {
  const { menuId } = await siapkanMenuHarian();
  await assert.rejects(
    () => pool.query(
      `INSERT INTO daily_menu_items (tanggal, menu_item_id, harga, kuota)
       VALUES (DATE '2026-10-01', $1, 32000, 5)`,
      [menuId]
    ),
    (err) => err.code === '23505'
  );
});

test('status service_day selain open/closed ditolak', async () => {
  await assert.rejects(
    () => pool.query(
      `INSERT INTO service_days (tanggal, status, batas_waktu_pesan)
       VALUES (DATE '2026-10-02', 'libur', TIMESTAMPTZ '2026-10-01 20:00:00+07')`
    ),
    (err) => err.code === '23514'
  );
});
```

- [ ] **Langkah 2: Jalankan dan pastikan gagal**

```bash
cd server && npm test
```

Harapan: GAGAL dengan `relation "menu_items" does not exist` (`42P01`).

- [ ] **Langkah 3: Tulis migrasi**

`server/migrations/002_menu.sql`:

```sql
CREATE TABLE menu_items (
  id        BIGSERIAL PRIMARY KEY,
  nama      TEXT    NOT NULL,
  deskripsi TEXT    NOT NULL DEFAULT '',
  harga     BIGINT  NOT NULL,
  aktif     BOOLEAN NOT NULL DEFAULT true,

  CONSTRAINT harga_positif CHECK (harga > 0)
);

CREATE TABLE service_days (
  tanggal           DATE        PRIMARY KEY,
  status            TEXT        NOT NULL DEFAULT 'open',
  batas_waktu_pesan TIMESTAMPTZ NOT NULL,

  CONSTRAINT status_valid CHECK (status IN ('open', 'closed'))
);

CREATE TABLE daily_menu_items (
  id           BIGSERIAL PRIMARY KEY,
  tanggal      DATE    NOT NULL REFERENCES service_days(tanggal) ON DELETE CASCADE,
  menu_item_id BIGINT  NOT NULL REFERENCES menu_items(id),
  harga        BIGINT  NOT NULL,
  kuota        INTEGER NOT NULL,
  terjual      INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT harga_positif        CHECK (harga > 0),
  CONSTRAINT kuota_positif        CHECK (kuota > 0),
  CONSTRAINT terjual_tidak_minus  CHECK (terjual >= 0),
  CONSTRAINT tidak_over_jual      CHECK (terjual <= kuota),
  CONSTRAINT unik_menu_per_tanggal UNIQUE (tanggal, menu_item_id)
);
```

**Kenapa `harga` ada di dua tempat** (`menu_items.harga` dan
`daily_menu_items.harga`): yang di `menu_items` adalah harga berlaku saat ini,
yang di `daily_menu_items` adalah harga yang dikunci untuk tanggal itu. Kalau
harga naik hari ini, pesanan untuk besok yang sudah dibuka kemarin tetap
memakai harga lama. Ini penerapan prinsip snapshot dari spec bagian 4.

- [ ] **Langkah 4: Jalankan migrasi dan test**

```bash
cd server && npm run migrate:test && npm test
```

Harapan: 5 test menu LULUS.

- [ ] **Langkah 5: Migrasi database pengembangan lalu commit**

```bash
cd server && npm run migrate
```

```bash
git add server/migrations/002_menu.sql server/tests/skema_menu.test.js
git commit -m "feat: tabel menu, tanggal layanan, dan kuota harian"
```

---

## Task 1.3: Migrasi 003 — pesanan, buku besar, pengisian saldo

**Berkas:**
- Buat: `server/migrations/003_pesanan.sql`
- Buat: `server/tests/skema_pesanan.test.js`

**Interfaces:**
- Consumes: tabel dari migrasi 001 dan 002
- Produces: tabel `orders`, `order_items`, `credit_ledger`, `topup_requests`

- [ ] **Langkah 1: Tulis test yang gagal**

`server/tests/skema_pesanan.test.js`:

```js
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { resetDatabase } from './helper.js';

after(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDatabase();
});

async function siapkan() {
  const user = await pool.query(
    `INSERT INTO users (email, password_hash, nama, alamat, saldo)
     VALUES ('pesan@contoh.test', 'h', 'Pemesan', 'Jl. Uji No. 1', 100000)
     RETURNING id`
  );
  await pool.query(
    `INSERT INTO service_days (tanggal, batas_waktu_pesan)
     VALUES (DATE '2026-10-01', TIMESTAMPTZ '2026-09-30 20:00:00+07')`
  );
  return { userId: user.rows[0].id };
}

test('pesanan bisa dibuat dan menyimpan alamat sebagai snapshot', async () => {
  const { userId } = await siapkan();
  const { rows } = await pool.query(
    `INSERT INTO orders (user_id, tanggal_layanan, total, alamat_antar)
     VALUES ($1, DATE '2026-10-01', 32000, 'Jl. Uji No. 1')
     RETURNING id, status, alamat_antar`,
    [userId]
  );
  assert.equal(rows[0].status, 'confirmed');
  assert.equal(rows[0].alamat_antar, 'Jl. Uji No. 1');
});

test('status pesanan yang tidak dikenal ditolak', async () => {
  const { userId } = await siapkan();
  await assert.rejects(
    () => pool.query(
      `INSERT INTO orders (user_id, tanggal_layanan, status, total, alamat_antar)
       VALUES ($1, DATE '2026-10-01', 'dikirim', 32000, 'Jl. Uji No. 1')`,
      [userId]
    ),
    (err) => err.code === '23514'
  );
});

test('buku besar menolak jumlah nol', async () => {
  const { userId } = await siapkan();
  await assert.rejects(
    () => pool.query(
      `INSERT INTO credit_ledger (user_id, jumlah, jenis) VALUES ($1, 0, 'topup')`,
      [userId]
    ),
    (err) => err.code === '23514'
  );
});

test('buku besar menerima jumlah negatif untuk pemotongan', async () => {
  const { userId } = await siapkan();
  const { rows } = await pool.query(
    `INSERT INTO credit_ledger (user_id, jumlah, jenis, catatan)
     VALUES ($1, -32000, 'order', 'pesanan uji') RETURNING id, jumlah`,
    [userId]
  );
  assert.equal(Number(rows[0].jumlah), -32000);
});

test('pengajuan isi saldo dimulai dengan status pending', async () => {
  const { userId } = await siapkan();
  const { rows } = await pool.query(
    `INSERT INTO topup_requests (user_id, nominal, catatan_bukti)
     VALUES ($1, 200000, 'transfer BCA 12.30') RETURNING status`,
    [userId]
  );
  assert.equal(rows[0].status, 'pending');
});

test('user yang punya pesanan tidak bisa dihapus', async () => {
  const { userId } = await siapkan();
  await pool.query(
    `INSERT INTO orders (user_id, tanggal_layanan, total, alamat_antar)
     VALUES ($1, DATE '2026-10-01', 32000, 'Jl. Uji No. 1')`,
    [userId]
  );
  await assert.rejects(
    () => pool.query('DELETE FROM users WHERE id = $1', [userId]),
    (err) => err.code === '23503',
    'foreign key seharusnya melindungi riwayat pesanan'
  );
});
```

- [ ] **Langkah 2: Jalankan dan pastikan gagal**

```bash
cd server && npm test
```

Harapan: GAGAL dengan `relation "orders" does not exist`.

- [ ] **Langkah 3: Tulis migrasi**

`server/migrations/003_pesanan.sql`:

```sql
CREATE TABLE orders (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT      NOT NULL REFERENCES users(id),
  tanggal_layanan DATE        NOT NULL REFERENCES service_days(tanggal),
  status          TEXT        NOT NULL DEFAULT 'confirmed',
  total           BIGINT      NOT NULL,
  alamat_antar    TEXT        NOT NULL,
  dibuat_pada     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT status_valid  CHECK (status IN ('confirmed', 'cancelled', 'delivered')),
  CONSTRAINT total_positif CHECK (total > 0)
);

CREATE INDEX orders_user_idx    ON orders (user_id);
CREATE INDEX orders_tanggal_idx ON orders (tanggal_layanan);

CREATE TABLE order_items (
  id                 BIGSERIAL PRIMARY KEY,
  order_id           BIGINT  NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  daily_menu_item_id BIGINT  NOT NULL REFERENCES daily_menu_items(id),
  jumlah             INTEGER NOT NULL,
  harga_satuan       BIGINT  NOT NULL,

  CONSTRAINT jumlah_positif       CHECK (jumlah > 0),
  CONSTRAINT harga_satuan_positif CHECK (harga_satuan > 0)
);

CREATE INDEX order_items_order_idx ON order_items (order_id);

CREATE TABLE credit_ledger (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT      NOT NULL REFERENCES users(id),
  jumlah       BIGINT      NOT NULL,
  jenis        TEXT        NOT NULL,
  ref_order_id BIGINT      REFERENCES orders(id),
  catatan      TEXT        NOT NULL DEFAULT '',
  dibuat_pada  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT jenis_valid      CHECK (jenis IN ('topup', 'order', 'refund')),
  CONSTRAINT jumlah_bukan_nol CHECK (jumlah <> 0)
);

CREATE INDEX credit_ledger_user_idx ON credit_ledger (user_id);

CREATE TABLE topup_requests (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT      NOT NULL REFERENCES users(id),
  nominal       BIGINT      NOT NULL,
  catatan_bukti TEXT        NOT NULL DEFAULT '',
  status        TEXT        NOT NULL DEFAULT 'pending',
  ditinjau_oleh BIGINT      REFERENCES users(id),
  ditinjau_pada TIMESTAMPTZ,
  dibuat_pada   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT status_valid    CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT nominal_positif CHECK (nominal > 0)
);

CREATE INDEX topup_requests_status_idx ON topup_requests (status);
```

**Kenapa `orders.user_id` tanpa `ON DELETE CASCADE`:** justru sebaliknya —
tanpa `ON DELETE`, PostgreSQL memakai perilaku `NO ACTION`, yang berarti
menghapus user yang punya pesanan akan **ditolak**. Itu yang kita mau. Riwayat
yang menyentuh uang tidak boleh lenyap gara-gara satu perintah `DELETE`.

**Kenapa ada indeks pada `user_id` dan `tanggal_layanan`:** dua kueri paling
sering di aplikasi ini adalah "pesanan milik saya" dan "semua pesanan untuk
tanggal X" (daftar produksi). Tanpa indeks, keduanya memindai seluruh tabel.
PostgreSQL membuat indeks otomatis untuk primary key dan unique constraint,
tapi **tidak** untuk foreign key — itu tugasmu.

- [ ] **Langkah 4: Jalankan migrasi dan test**

```bash
cd server && npm run migrate:test && npm test
```

Harapan: 6 test pesanan LULUS. Total sekarang 21 test.

- [ ] **Langkah 5: Migrasi database pengembangan lalu commit**

```bash
cd server && npm run migrate
```

```bash
git add server/migrations/003_pesanan.sql server/tests/skema_pesanan.test.js
git commit -m "feat: tabel pesanan, item pesanan, buku besar, pengajuan isi saldo"
```

---

## Task 1.4: Data contoh (seed)

**Berkas:**
- Buat: `server/scripts/seed.js`

**Interfaces:**
- Consumes: `pool`, `withTransaction` dari `src/db.js`
- Produces: perintah `npm run seed`; data contoh yang bisa dipakai menguji
  aplikasi secara manual.

- [ ] **Langkah 1: Tulis skrip seed**

`server/scripts/seed.js`:

```js
import { pool, withTransaction } from '../src/db.js';

// CATATAN: password_hash di sini masih teks palsu. Fase 2 akan mengganti
// skrip ini agar memakai bcrypt sungguhan. Jangan pernah memakai pola ini
// di luar data contoh lokal.
const HASH_PALSU = 'BELUM_DI_HASH_ganti_di_fase_2';

async function seed() {
  await withTransaction(async (c) => {
    await c.query(`
      TRUNCATE order_items, orders, credit_ledger, topup_requests,
               daily_menu_items, service_days, menu_items, sessions, users
      RESTART IDENTITY CASCADE
    `);

    await c.query(
      `INSERT INTO users (email, password_hash, nama, telepon, alamat, peran)
       VALUES ('dapur@rantang.test', $1, 'Dapur Rantang', '0800000000', 'Dapur Pusat', 'kitchen')`,
      [HASH_PALSU]
    );

    await c.query(
      `INSERT INTO users (email, password_hash, nama, telepon, alamat, peran, saldo)
       VALUES
         ('rico@contoh.test',  $1, 'Rico',  '0811111111', 'Jl. Melati No. 12', 'customer', 250000),
         ('sinta@contoh.test', $1, 'Sinta', '0822222222', 'Jl. Kenanga No. 4', 'customer', 64000)`,
      [HASH_PALSU]
    );

    const menu = await c.query(`
      INSERT INTO menu_items (nama, deskripsi, harga) VALUES
        ('Katsu Ayam Saus Rendang', 'Katsu ayam, saus rendang, nasi merah, tumis buncis', 32000),
        ('Ayam Bakar Bumbu Bali',   'Ayam bakar, nasi putih, urap sayur',                  30000),
        ('Tahu Tempe Kecap Manis',  'Tahu tempe, nasi merah, cah kangkung',                24000)
      RETURNING id
    `);
    const [m1, m2, m3] = menu.rows.map((r) => r.id);

    // Dua tanggal layanan: besok dan lusa, relatif terhadap hari ini di WIB.
    await c.query(`
      INSERT INTO service_days (tanggal, batas_waktu_pesan) VALUES
        ((now() AT TIME ZONE 'Asia/Jakarta')::date + 1,
         ((now() AT TIME ZONE 'Asia/Jakarta')::date + INTERVAL '20 hours') AT TIME ZONE 'Asia/Jakarta'),
        ((now() AT TIME ZONE 'Asia/Jakarta')::date + 2,
         ((now() AT TIME ZONE 'Asia/Jakarta')::date + INTERVAL '1 day 20 hours') AT TIME ZONE 'Asia/Jakarta')
    `);

    await c.query(
      `INSERT INTO daily_menu_items (tanggal, menu_item_id, harga, kuota) VALUES
         ((now() AT TIME ZONE 'Asia/Jakarta')::date + 1, $1, 32000, 40),
         ((now() AT TIME ZONE 'Asia/Jakarta')::date + 1, $2, 30000, 30),
         ((now() AT TIME ZONE 'Asia/Jakarta')::date + 2, $1, 32000, 40),
         ((now() AT TIME ZONE 'Asia/Jakarta')::date + 2, $3, 24000, 25)`,
      [m1, m2, m3]
    );
  });

  console.log('Data contoh berhasil dimasukkan.');
}

seed()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

**Kenapa seluruh seed dibungkus satu transaksi:** kalau baris terakhir gagal,
kamu tidak ingin database berisi separuh data contoh yang membingungkan.
Semua masuk, atau tidak sama sekali.

**Kenapa `AT TIME ZONE 'Asia/Jakarta'` dua kali dan tampak berbelit:** yang
pertama mengubah waktu sekarang ke waktu dinding WIB agar "besok" berarti
besok menurut Jakarta, bukan menurut UTC. Yang kedua mengubah waktu dinding
itu kembali menjadi `timestamptz` yang tepat. Kalau ini terasa membingungkan,
itu wajar — zona waktu memang membingungkan, dan itulah sebabnya spec
menetapkan aturannya di awal alih-alih membiarkanmu menebak tiap kali.

- [ ] **Langkah 2: Jalankan seed**

```bash
cd server && npm run seed
```

Harapan: `Data contoh berhasil dimasukkan.`

- [ ] **Langkah 3: Periksa hasilnya dengan mata sendiri**

```bash
psql -U postgres -d rantang_dev -c "SELECT d.tanggal, m.nama, d.harga, d.kuota, d.terjual FROM daily_menu_items d JOIN menu_items m ON m.id = d.menu_item_id ORDER BY d.tanggal, m.nama;"
```

Harapan: empat baris menu harian untuk dua tanggal ke depan.

- [ ] **Langkah 4: Jalankan seed dua kali, pastikan tidak menggandakan**

```bash
cd server && npm run seed && npm run seed
```

Harapan: tetap empat baris, bukan delapan — karena seed diawali `TRUNCATE`.

- [ ] **Langkah 5: Commit**

```bash
git add server/scripts/seed.js
git commit -m "feat: skrip data contoh untuk pengembangan lokal"
```

---

## Task 1.5: README dan penutup fase

**Berkas:**
- Buat: `README.md`

**Interfaces:**
- Produces: instruksi yang cukup bagi orang lain untuk menjalankan proyek ini
  dari nol.

- [ ] **Langkah 1: Tulis README**

`README.md`:

````markdown
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

React + Vite → HTTP/JSON → Express (Node) → SQL langsung → PostgreSQL

Sengaja tanpa ORM: transaksi, penguncian baris, dan bentuk kueri adalah inti
pelajaran proyek ini, dan ORM menyembunyikan ketiganya.

## Menjalankan secara lokal

Prasyarat: Node 22+, PostgreSQL 16+.

```bash
psql -U postgres -c "CREATE DATABASE rantang_dev;"
psql -U postgres -c "CREATE DATABASE rantang_test;"
```

```bash
cd server
cp .env.example .env
# sunting .env, isi kata sandi PostgreSQL milikmu
npm install
npm run migrate
npm run seed
```

## Test

```bash
cd server
cp .env.example .env.test
# sunting .env.test, arahkan ke rantang_test
npm run migrate:test
npm test
```

## Dokumen

- Desain: `docs/superpowers/specs/2026-09-07-rantang-pemesanan-design.md`
- Rencana Fase 0–1: `docs/superpowers/plans/2026-09-07-fase-0-1-fondasi.md`

## Status

Fase 0–1 selesai: skema database dan migrasi.
Berikutnya: autentikasi (Fase 2), lalu inti pemesanan (Fase 4).
````

- [ ] **Langkah 2: Verifikasi README dengan menjalankan ulang dari nol**

```bash
psql -U postgres -c "DROP DATABASE rantang_dev;" && psql -U postgres -c "CREATE DATABASE rantang_dev;"
```

```bash
cd server && npm run migrate && npm run seed
```

Harapan: berhasil tanpa langkah tambahan yang tidak tertulis di README. Kalau
ada langkah yang kamu lakukan dari ingatan, tambahkan ke README — itulah
gunanya latihan ini.

- [ ] **Langkah 3: Jalankan seluruh test sekali lagi**

```bash
cd server && npm test
```

Harapan: 21 test LULUS, 0 gagal.

- [ ] **Langkah 4: Commit**

```bash
git add README.md
git commit -m "docs: README dengan instruksi menjalankan dari nol"
```

---

## Definisi Selesai untuk Fase 0–1

- [ ] PostgreSQL terpasang, `rantang_dev` dan `rantang_test` ada
- [ ] `npm run migrate` berjalan bersih dari database kosong
- [ ] `npm run seed` mengisi data contoh dan aman dijalankan berulang
- [ ] `npm test` lulus 21 test
- [ ] `.env` dan `.env.test` **tidak** terlacak git
- [ ] Test membuktikan database menolak: saldo minus, over-jual, peran tidak
      dikenal, status tidak dikenal, email ganda, penghapusan user yang punya
      pesanan
- [ ] README cukup bagi orang lain menjalankan proyek ini dari nol

## Yang Sengaja Belum Ada di Fase Ini

Express dan endpoint HTTP · bcrypt dan sesi · logika pemesanan · frontend.
Semua itu dibangun di Fase 2 ke atas. Fase ini hanya fondasi data, dan fondasi
itu sudah punya test yang membuktikan dirinya benar.
