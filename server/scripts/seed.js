import { pool, withTransaction } from '../src/db.js';

// CATATAN: password_hash di sini masih teks palsu. Fase 2 akan mengganti skrip
// ini agar memakai bcrypt sungguhan. Jangan pernah memakai pola ini di luar
// data contoh lokal.
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
