import { pool, withTransaction } from '../src/db.js';
import { hashPassword } from '../src/auth/password.js';

// Kata sandi seragam untuk semua akun contoh. Ini HANYA untuk database
// pengembangan di mesin sendiri — tidak pernah dipakai di mana pun selain di
// sini, dan skrip ini tidak boleh dijalankan terhadap data sungguhan.
const KATA_SANDI_CONTOH = 'rantang-demo-2026';

async function seed() {
  const hash = await hashPassword(KATA_SANDI_CONTOH);

  await withTransaction(async (c) => {
    await c.query(`
      TRUNCATE order_items, orders, credit_ledger, topup_requests,
               daily_menu_items, service_days, menu_items, sessions, users
      RESTART IDENTITY CASCADE
    `);

    await c.query(
      `INSERT INTO users (email, password_hash, nama, telepon, alamat, peran)
       VALUES ('dapur@rantang.test', $1, 'Dapur Rantang', '0800000000', 'Dapur Pusat', 'kitchen')`,
      [hash]
    );

    // Saldo awal ditulis bersama barisnya di buku besar, bukan langsung ke
    // kolom saldo. Aturan sistem ini adalah SUM(credit_ledger) selalu sama
    // dengan users.saldo — data contoh tidak boleh jadi satu-satunya tempat
    // aturan itu dilanggar.
    const pelanggan = await c.query(
      `INSERT INTO users (email, password_hash, nama, telepon, alamat, peran, saldo)
       VALUES
         ('rico@contoh.test',  $1, 'Rico',  '0811111111', 'Jl. Melati No. 12', 'customer', 250000),
         ('sinta@contoh.test', $1, 'Sinta', '0822222222', 'Jl. Kenanga No. 4', 'customer', 64000)
       RETURNING id, saldo`,
      [hash]
    );

    for (const u of pelanggan.rows) {
      await c.query(
        `INSERT INTO credit_ledger (user_id, jumlah, jenis, catatan)
         VALUES ($1, $2, 'topup', 'saldo awal data contoh')`,
        [u.id, u.saldo]
      );
    }

    const menu = await c.query(`
      INSERT INTO menu_items (nama, deskripsi, harga) VALUES
        ('Katsu Ayam Saus Rendang', 'Katsu ayam, saus rendang, nasi merah, tumis buncis', 32000),
        ('Ayam Bakar Bumbu Bali',   'Ayam bakar, nasi putih, urap sayur',                  30000),
        ('Tahu Tempe Kecap Manis',  'Tahu tempe, nasi merah, cah kangkung',                24000)
      RETURNING id
    `);
    const [m1, m2, m3] = menu.rows.map((r) => r.id);

    // Dua tanggal layanan: besok dan lusa, menurut kalender WIB.
    // Batas pesan dipatok pukul 06.00 WIB pada hari layanan itu sendiri —
    // selalu masih di masa depan, sehingga data contoh benar-benar bisa dipesan
    // kapan pun seed dijalankan. Di dunia nyata batasnya kemungkinan malam
    // sebelumnya, tapi data contoh yang sudah kedaluwarsa begitu dibuat tidak
    // ada gunanya.
    await c.query(`
      INSERT INTO service_days (tanggal, batas_waktu_pesan) VALUES
        ((now() AT TIME ZONE 'Asia/Jakarta')::date + 1,
         (((now() AT TIME ZONE 'Asia/Jakarta')::date + 1)::timestamp + INTERVAL '6 hours') AT TIME ZONE 'Asia/Jakarta'),
        ((now() AT TIME ZONE 'Asia/Jakarta')::date + 2,
         (((now() AT TIME ZONE 'Asia/Jakarta')::date + 2)::timestamp + INTERVAL '6 hours') AT TIME ZONE 'Asia/Jakarta')
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
  console.log(`Akun contoh: dapur@rantang.test / rico@contoh.test / sinta@contoh.test`);
  console.log(`Kata sandi semuanya: ${KATA_SANDI_CONTOH}`);
}

seed()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
