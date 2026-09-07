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

  const berkas = (await readdir(DIR)).filter((f) => f.endsWith('.sql')).sort();

  for (const nama of berkas) {
    if (sudah.has(nama)) continue;

    const sql = await readFile(new URL(nama, DIR), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (versi) VALUES ($1)', [nama]);
      await client.query('COMMIT');
      console.log(`  ok     ${nama}`);
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
