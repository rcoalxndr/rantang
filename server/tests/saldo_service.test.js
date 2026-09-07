import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { resetDatabase, panaskanPool } from './helper.js';
import {
  ajukanTopup,
  daftarTopupSaya,
  daftarTopupPending,
  setujuiTopup,
  tolakTopup,
  lihatSaldo,
} from '../src/services/saldo.js';
import {
  NominalTidakValid,
  TopupTidakDitemukan,
  TopupSudahDitinjau,
  TidakBerwenang,
} from '../src/errors.js';

after(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDatabase();
});

async function buatUser(peran = 'customer') {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, nama, peran)
     VALUES ($1, 'h', 'Uji', $2) RETURNING id`,
    [`saldo-${Date.now()}-${Math.random()}@contoh.test`, peran]
  );
  return rows[0].id;
}

async function saldoDari(userId) {
  const { rows } = await pool.query('SELECT saldo FROM users WHERE id = $1', [userId]);
  return rows[0].saldo;
}

// ---------------------------------------------------------------------------
// Pengajuan
// ---------------------------------------------------------------------------

test('pengajuan isi saldo dimulai pending dan belum menambah saldo', async () => {
  const userId = await buatUser();

  const topup = await ajukanTopup({
    userId,
    nominal: 200000,
    catatanBukti: 'transfer BCA 12.30',
  });

  assert.equal(topup.status, 'pending');
  assert.equal(topup.nominal, 200000);
  assert.equal(typeof topup.nominal, 'number');
  assert.equal(await saldoDari(userId), 0, 'saldo belum boleh bertambah sebelum disetujui');
});

test('nominal tidak valid ditolak', async () => {
  const userId = await buatUser();
  const coba = (nominal) => ajukanTopup({ userId, nominal, catatanBukti: '' });

  await assert.rejects(() => coba(0), NominalTidakValid);
  await assert.rejects(() => coba(-5000), NominalTidakValid);
  await assert.rejects(() => coba(1000.5), NominalTidakValid);
  await assert.rejects(() => coba('200000'), NominalTidakValid);
});

test('daftar pengajuan saya hanya berisi milik sendiri', async () => {
  const a = await buatUser();
  const b = await buatUser();

  await ajukanTopup({ userId: a, nominal: 100000, catatanBukti: 'punya A' });
  await ajukanTopup({ userId: a, nominal: 50000, catatanBukti: 'punya A lagi' });
  await ajukanTopup({ userId: b, nominal: 75000, catatanBukti: 'punya B' });

  const punyaA = await daftarTopupSaya(a);
  assert.equal(punyaA.length, 2);
  assert.ok(punyaA.every((t) => t.catatanBukti.includes('punya A')));
});

// ---------------------------------------------------------------------------
// Persetujuan
// ---------------------------------------------------------------------------

test('persetujuan menambah saldo dan mencatat buku besar', async () => {
  const userId = await buatUser();
  const dapur = await buatUser('kitchen');
  const topup = await ajukanTopup({ userId, nominal: 200000, catatanBukti: 'BCA' });

  const hasil = await setujuiTopup({ reviewerId: dapur, topupId: topup.id });

  assert.equal(hasil.status, 'approved');
  assert.equal(hasil.saldoBaru, 200000);
  assert.equal(await saldoDari(userId), 200000);

  const { rows } = await pool.query(
    `SELECT jumlah, jenis FROM credit_ledger WHERE user_id = $1`,
    [userId]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].jenis, 'topup');
  assert.equal(rows[0].jumlah, 200000);
});

test('peninjau tercatat di pengajuan', async () => {
  const userId = await buatUser();
  const dapur = await buatUser('kitchen');
  const topup = await ajukanTopup({ userId, nominal: 50000, catatanBukti: '' });

  await setujuiTopup({ reviewerId: dapur, topupId: topup.id });

  const { rows } = await pool.query(
    'SELECT ditinjau_oleh, ditinjau_pada FROM topup_requests WHERE id = $1',
    [topup.id]
  );
  assert.equal(Number(rows[0].ditinjau_oleh), Number(dapur));
  assert.ok(rows[0].ditinjau_pada instanceof Date);
});

test('persetujuan dua kali ditolak dan saldo tidak dobel', async () => {
  const userId = await buatUser();
  const dapur = await buatUser('kitchen');
  const topup = await ajukanTopup({ userId, nominal: 200000, catatanBukti: '' });

  await setujuiTopup({ reviewerId: dapur, topupId: topup.id });
  await assert.rejects(
    () => setujuiTopup({ reviewerId: dapur, topupId: topup.id }),
    TopupSudahDitinjau
  );

  assert.equal(await saldoDari(userId), 200000, 'saldo tidak boleh ditambah dua kali');
});

test('pengajuan yang tidak ada menghasilkan 404', async () => {
  const dapur = await buatUser('kitchen');
  await assert.rejects(
    () => setujuiTopup({ reviewerId: dapur, topupId: 999999 }),
    TopupTidakDitemukan
  );
});

test('peninjau yang bukan dapur ditolak', async () => {
  const userId = await buatUser();
  const orangLain = await buatUser('customer');
  const topup = await ajukanTopup({ userId, nominal: 50000, catatanBukti: '' });

  await assert.rejects(
    () => setujuiTopup({ reviewerId: orangLain, topupId: topup.id }),
    TidakBerwenang
  );
  assert.equal(await saldoDari(userId), 0);
});

// ---------------------------------------------------------------------------
// Penolakan
// ---------------------------------------------------------------------------

test('penolakan tidak menambah saldo dan tidak mencatat buku besar', async () => {
  const userId = await buatUser();
  const dapur = await buatUser('kitchen');
  const topup = await ajukanTopup({ userId, nominal: 200000, catatanBukti: 'bukti palsu' });

  const hasil = await tolakTopup({ reviewerId: dapur, topupId: topup.id });

  assert.equal(hasil.status, 'rejected');
  assert.equal(await saldoDari(userId), 0);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM credit_ledger');
  assert.equal(rows[0].n, 0);
});

test('pengajuan yang sudah ditolak tidak bisa disetujui', async () => {
  const userId = await buatUser();
  const dapur = await buatUser('kitchen');
  const topup = await ajukanTopup({ userId, nominal: 200000, catatanBukti: '' });

  await tolakTopup({ reviewerId: dapur, topupId: topup.id });
  await assert.rejects(
    () => setujuiTopup({ reviewerId: dapur, topupId: topup.id }),
    TopupSudahDitinjau
  );
  assert.equal(await saldoDari(userId), 0);
});

// ---------------------------------------------------------------------------
// Antrean dapur
// ---------------------------------------------------------------------------

test('daftar pending hanya memuat yang belum ditinjau, lengkap dengan nama pengaju', async () => {
  const a = await buatUser();
  const b = await buatUser();
  const dapur = await buatUser('kitchen');

  const t1 = await ajukanTopup({ userId: a, nominal: 100000, catatanBukti: 'satu' });
  await ajukanTopup({ userId: b, nominal: 50000, catatanBukti: 'dua' });
  await setujuiTopup({ reviewerId: dapur, topupId: t1.id });

  const pending = await daftarTopupPending();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].nominal, 50000);
  assert.equal(pending[0].nama, 'Uji', 'daftar dapur harus menyertakan identitas pengaju');
});

// ---------------------------------------------------------------------------
// Saldo dan riwayat
// ---------------------------------------------------------------------------

test('lihat saldo memberi angka dan riwayat buku besar', async () => {
  const userId = await buatUser();
  const dapur = await buatUser('kitchen');
  const t1 = await ajukanTopup({ userId, nominal: 200000, catatanBukti: 'BCA' });
  await setujuiTopup({ reviewerId: dapur, topupId: t1.id });

  const hasil = await lihatSaldo(userId);

  assert.equal(hasil.saldo, 200000);
  assert.equal(hasil.riwayat.length, 1);
  assert.equal(hasil.riwayat[0].jenis, 'topup');
  assert.equal(hasil.riwayat[0].jumlah, 200000);
  assert.ok(hasil.riwayat[0].dibuatPada instanceof Date);
});

test('riwayat kosong untuk user baru, bukan error', async () => {
  const userId = await buatUser();
  const hasil = await lihatSaldo(userId);
  assert.equal(hasil.saldo, 0);
  assert.deepEqual(hasil.riwayat, []);
});

// ---------------------------------------------------------------------------
// Perebutan
// ---------------------------------------------------------------------------

test('lima persetujuan bersamaan atas satu pengajuan: saldo hanya bertambah sekali', async () => {
  const userId = await buatUser();
  const dapur = await buatUser('kitchen');
  const topup = await ajukanTopup({ userId, nominal: 200000, catatanBukti: '' });

  await panaskanPool();

  const hasil = await Promise.allSettled(
    Array.from({ length: 5 }, () => setujuiTopup({ reviewerId: dapur, topupId: topup.id }))
  );

  const berhasil = hasil.filter((h) => h.status === 'fulfilled');
  assert.equal(berhasil.length, 1, `harus tepat 1 yang berhasil, dapat ${berhasil.length}`);
  assert.ok(
    hasil
      .filter((h) => h.status === 'rejected')
      .every((g) => g.reason instanceof TopupSudahDitinjau),
    `semua kegagalan harus TopupSudahDitinjau, dapat: ${[
      ...new Set(hasil.filter((h) => h.status === 'rejected').map((g) => g.reason?.constructor?.name)),
    ].join(', ')}`
  );

  assert.equal(await saldoDari(userId), 200000);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM credit_ledger');
  assert.equal(rows[0].n, 1, 'buku besar hanya boleh mencatat satu baris');
});
