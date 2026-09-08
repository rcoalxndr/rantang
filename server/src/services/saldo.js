import { pool, withTransaction } from '../db.js';
import {
  NominalTidakValid,
  TopupTidakDitemukan,
  TopupSudahDitinjau,
  TidakBerwenang,
} from '../errors.js';

/**
 * Pengisian saldo dilakukan lewat transfer manual yang dikonfirmasi dapur.
 *
 * Ini bukan versi murahan dari gerbang pembayaran — ini memang cara mayoritas
 * usaha kecil di Indonesia bekerja, dan menyingkirkan seluruh urusan menyimpan
 * data pembayaran orang lain dari proyek ini. Pelajaran yang penting tetap
 * didapat utuh: saldo, riwayat mutasi, dan persetujuan yang tidak boleh
 * dijalankan dua kali.
 */

export async function ajukanTopup({ userId, nominal, catatanBukti = '' }) {
  if (!Number.isInteger(nominal) || nominal <= 0) throw new NominalTidakValid();

  const { rows } = await pool.query(
    `INSERT INTO topup_requests (user_id, nominal, catatan_bukti)
     VALUES ($1, $2, $3)
     RETURNING id, nominal, status, catatan_bukti, dibuat_pada`,
    [userId, nominal, String(catatanBukti ?? '')]
  );

  return bentukTopup(rows[0]);
}

function bentukTopup(r) {
  return {
    id: r.id,
    nominal: r.nominal,
    status: r.status,
    catatanBukti: r.catatan_bukti,
    dibuatPada: r.dibuat_pada,
  };
}

export async function daftarTopupSaya(userId) {
  const { rows } = await pool.query(
    `SELECT id, nominal, status, catatan_bukti, dibuat_pada
     FROM topup_requests WHERE user_id = $1 ORDER BY id DESC LIMIT 200`,
    [userId]
  );
  return rows.map(bentukTopup);
}

export async function daftarTopupPending() {
  const { rows } = await pool.query(
    `SELECT t.id, t.user_id, u.nama, u.email, t.nominal, t.catatan_bukti, t.dibuat_pada
     FROM topup_requests t
     JOIN users u ON u.id = t.user_id
     WHERE t.status = 'pending'
     ORDER BY t.id
     LIMIT 200`
  );

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    nama: r.nama,
    email: r.email,
    nominal: r.nominal,
    catatanBukti: r.catatan_bukti,
    dibuatPada: r.dibuat_pada,
  }));
}

/** Memastikan peninjau benar-benar berperan dapur. */
async function pastikanDapur(c, reviewerId) {
  const { rows } = await c.query('SELECT peran FROM users WHERE id = $1', [reviewerId]);
  if (rows.length === 0 || rows[0].peran !== 'dapur') throw new TidakBerwenang();
}

/**
 * Menyetujui pengajuan: saldo bertambah, buku besar bertambah satu baris, dan
 * pengajuannya ditandai approved — semuanya dalam satu transaksi.
 */
export async function setujuiTopup({ reviewerId, topupId }) {
  return withTransaction(async (c) => {
    await pastikanDapur(c, reviewerId);

    const { rows: awal } = await c.query(
      'SELECT id, user_id, nominal, status FROM topup_requests WHERE id = $1',
      [topupId]
    );
    if (awal.length === 0) throw new TopupTidakDitemukan();
    if (awal[0].status !== 'pending') throw new TopupSudahDitinjau();

    // Pemeriksaan di atas hanya untuk memberi pesan yang tepat. Yang MENJAMIN
    // saldo tidak bertambah dua kali adalah syarat status di WHERE ini: lima
    // persetujuan bersamaan, hanya satu yang mengubah baris.
    const ditandai = await c.query(
      `UPDATE topup_requests
       SET status = 'approved', ditinjau_oleh = $2, ditinjau_pada = now()
       WHERE id = $1 AND status = 'pending'
       RETURNING id, user_id, nominal`,
      [topupId, reviewerId]
    );
    if (ditandai.rowCount === 0) throw new TopupSudahDitinjau();

    // id diambil dari baris database, bukan dari argumen: yang masuk lewat URL
    // berupa string, dan mengembalikannya apa adanya membuat tipe id di API
    // tidak konsisten dengan endpoint lain.
    const { id, user_id: userId, nominal } = ditandai.rows[0];

    const saldo = await c.query(
      'UPDATE users SET saldo = saldo + $2 WHERE id = $1 RETURNING saldo',
      [userId, nominal]
    );

    await c.query(
      `INSERT INTO credit_ledger (user_id, jumlah, jenis, catatan)
       VALUES ($1, $2, 'topup', $3)`,
      [userId, nominal, `pengisian saldo #${id}`]
    );

    return { id, status: 'approved', saldoBaru: saldo.rows[0].saldo };
  });
}

export async function tolakTopup({ reviewerId, topupId }) {
  return withTransaction(async (c) => {
    await pastikanDapur(c, reviewerId);

    const { rows: awal } = await c.query(
      'SELECT id, status FROM topup_requests WHERE id = $1',
      [topupId]
    );
    if (awal.length === 0) throw new TopupTidakDitemukan();
    if (awal[0].status !== 'pending') throw new TopupSudahDitinjau();

    const ditandai = await c.query(
      `UPDATE topup_requests
       SET status = 'rejected', ditinjau_oleh = $2, ditinjau_pada = now()
       WHERE id = $1 AND status = 'pending'
       RETURNING id`,
      [topupId, reviewerId]
    );
    if (ditandai.rowCount === 0) throw new TopupSudahDitinjau();

    // Penolakan tidak menyentuh saldo maupun buku besar. Buku besar hanya
    // mencatat uang yang benar-benar bergerak.
    return { id: ditandai.rows[0].id, status: 'rejected' };
  });
}

export async function lihatSaldo(userId) {
  const { rows: user } = await pool.query('SELECT saldo FROM users WHERE id = $1', [userId]);

  const { rows: riwayat } = await pool.query(
    `SELECT id, jumlah, jenis, ref_order_id, catatan, dibuat_pada
     FROM credit_ledger WHERE user_id = $1
     ORDER BY id DESC
     LIMIT 200`,
    [userId]
  );

  return {
    saldo: user[0]?.saldo ?? 0,
    riwayat: riwayat.map((r) => ({
      id: r.id,
      jumlah: r.jumlah,
      jenis: r.jenis,
      refOrderId: r.ref_order_id,
      catatan: r.catatan,
      dibuatPada: r.dibuat_pada,
    })),
  };
}
