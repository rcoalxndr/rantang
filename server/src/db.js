import pg from 'pg';

const { Pool, types } = pg;

// PostgreSQL BIGINT (OID 20) bisa menampung angka lebih besar daripada yang
// bisa diwakili JavaScript dengan tepat, jadi driver pg mengembalikannya
// sebagai STRING supaya tidak ada presisi yang diam-diam hilang.
//
// Akibatnya `saldo` dan `harga` datang sebagai '25000', bukan 25000 — dan
// '25000' - 1000 menghasilkan 24000 sementara '25000' + 1000 menghasilkan
// '250001000'. Bug uang yang sangat sulit terlihat.
//
// Nilai terbesar yang bisa diwakili JavaScript dengan tepat adalah sekitar
// 9 kuadriliun (2^53). Seluruh angka di aplikasi ini — rupiah, id, kuota —
// jauh di bawah itu, jadi mengubahnya jadi Number aman dan membuat seluruh
// kode konsisten.
types.setTypeParser(types.builtins.INT8, (nilai) => Number(nilai));

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL belum diset. Jalankan lewat npm script yang memakai --env-file.'
  );
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
