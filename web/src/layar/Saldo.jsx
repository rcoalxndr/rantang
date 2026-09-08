import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { keRupiah, keWaktu } from '../format.js';

const JENIS = {
  topup: 'Isi saldo',
  order: 'Pesanan',
  refund: 'Pengembalian',
};

const STATUS_TOPUP = {
  pending: { teks: 'Menunggu dapur', kelas: 'kunyit' },
  approved: { teks: 'Disetujui', kelas: '' },
  rejected: { teks: 'Ditolak', kelas: 'merah' },
};

export function Saldo() {
  const [data, setData] = useState(null);
  const [pengajuan, setPengajuan] = useState([]);
  const [nominal, setNominal] = useState('');
  const [catatan, setCatatan] = useState('');
  const [galat, setGalat] = useState(null);
  const [sukses, setSukses] = useState(null);
  const [sibuk, setSibuk] = useState(false);

  const muat = useCallback(() => {
    Promise.all([api.get('/balance'), api.get('/topups')])
      .then(([saldo, t]) => {
        setData(saldo);
        setPengajuan(t.topup);
      })
      .catch((e) => setGalat(e.message));
  }, []);

  useEffect(muat, [muat]);

  async function ajukan(e) {
    e.preventDefault();
    setGalat(null);
    setSukses(null);
    setSibuk(true);
    try {
      await api.post('/topups', {
        nominal: Number(nominal),
        catatanBukti: catatan,
      });
      setSukses('Pengajuan terkirim. Dapur akan memeriksa buktinya.');
      setNominal('');
      setCatatan('');
      muat();
    } catch (err) {
      setGalat(err.message);
    } finally {
      setSibuk(false);
    }
  }

  return (
    <>
      <div className="judul-layar">
        <h1>Saldo</h1>
        <p>Isi saldo lewat transfer, lalu dapur mengonfirmasinya secara manual.</p>
      </div>

      {galat && <div className="pesan gagal">{galat}</div>}
      {sukses && <div className="pesan berhasil">{sukses}</div>}

      <div className="kisi">
        <div className="kartu">
          <div className="jejak">Saldo tersedia</div>
          <div className="angka-besar">{keRupiah(data?.saldo ?? 0)}</div>
        </div>

        <form className="kartu" onSubmit={ajukan}>
          <h3>Ajukan isi saldo</h3>
          <div className="bidang">
            <label htmlFor="nominal">Nominal (rupiah)</label>
            <input
              id="nominal"
              type="number"
              min="1"
              step="1"
              value={nominal}
              onChange={(e) => setNominal(e.target.value)}
              required
            />
          </div>
          <div className="bidang">
            <label htmlFor="catatan">Catatan bukti transfer</label>
            <input
              id="catatan"
              placeholder="mis. BCA 19.40 a.n. Rico"
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
            />
          </div>
          <button className="tombol" type="submit" disabled={sibuk}>
            {sibuk ? 'Mengirim…' : 'Ajukan'}
          </button>
        </form>
      </div>

      <div className="kartu">
        <h2>Pengajuan isi saldo</h2>
        {pengajuan.length === 0 && <div className="kosong">Belum ada pengajuan.</div>}
        {pengajuan.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Catatan</th>
                <th className="angka">Nominal</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pengajuan.map((t) => {
                const s = STATUS_TOPUP[t.status] ?? { teks: t.status, kelas: '' };
                return (
                  <tr key={t.id}>
                    <td>{keWaktu(t.dibuatPada)}</td>
                    <td>{t.catatanBukti || '—'}</td>
                    <td className="angka">{keRupiah(t.nominal)}</td>
                    <td>
                      <span className={`lencana ${s.kelas}`}>{s.teks}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="kartu">
        <h2>Riwayat mutasi</h2>
        <p className="jejak" style={{ marginTop: 0 }}>
          Setiap pergerakan saldo tercatat sebagai baris baru dan tidak pernah dihapus.
        </p>
        {data?.riwayat.length === 0 && <div className="kosong">Belum ada mutasi.</div>}
        {data?.riwayat.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Jenis</th>
                <th>Catatan</th>
                <th className="angka">Jumlah</th>
              </tr>
            </thead>
            <tbody>
              {data.riwayat.map((r) => (
                <tr key={r.id}>
                  <td>{keWaktu(r.dibuatPada)}</td>
                  <td>{JENIS[r.jenis] ?? r.jenis}</td>
                  <td>{r.catatan || '—'}</td>
                  <td
                    className="angka"
                    style={{ color: r.jumlah < 0 ? 'var(--bahaya)' : 'var(--daun)' }}
                  >
                    {r.jumlah > 0 ? '+' : '−'}
                    {keRupiah(Math.abs(r.jumlah))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
