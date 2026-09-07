import { buatApp } from './app.js';
import { pool } from './db.js';

const PORT = Number(process.env.PORT ?? 3000);

const server = buatApp().listen(PORT, () => {
  console.log(`Rantang API jalan di http://localhost:${PORT}`);
});

// Mematikan server dengan rapi: berhenti menerima koneksi baru, tunggu yang
// sedang berjalan selesai, baru tutup pool database. Tanpa ini, Ctrl+C bisa
// memutus transaksi di tengah jalan.
for (const sinyal of ['SIGINT', 'SIGTERM']) {
  process.on(sinyal, () => {
    console.log(`\n${sinyal} diterima, menutup server...`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  });
}
