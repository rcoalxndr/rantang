import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { keRupiah, keTanggal } from '../format.js';

const LENCANA = {
  confirmed: { teks: 'Dikonfirmasi', kelas: '' },
  delivered: { teks: 'Sudah diantar', kelas: 'kunyit' },
  cancelled: { teks: 'Dibatalkan', kelas: 'merah' },
};

export function Pesanan() {
  const [daftar, setDaftar] = useState(null);
  const [rinci, setRinci] = useState({});
  const [galat, setGalat] = useState(null);
  const [sibuk, setSibuk] = useState(null);

  const muat = useCallback(() => {
    api
      .get('/orders')
      .then((d) => setDaftar(d.pesanan))
      .catch((e) => setGalat(e.message));
  }, []);

  useEffect(muat, [muat]);

  async function bukaRincian(id) {
    if (rinci[id]) {
      setRinci((v) => ({ ...v, [id]: null }));
      return;
    }
    try {
      const d = await api.get(`/orders/${id}`);
      setRinci((v) => ({ ...v, [id]: d.pesanan }));
    } catch (e) {
      setGalat(e.message);
    }
  }

  async function batalkan(id) {
    setGalat(null);
    setSibuk(id);
    try {
      await api.post(`/orders/${id}/cancel`);
      setRinci((v) => ({ ...v, [id]: null }));
      muat();
    } catch (e) {
      setGalat(e.message);
    } finally {
      setSibuk(null);
    }
  }

  return (
    <>
      <div className="judul-layar">
        <h1>Pesanan toko</h1>
        <p>Pembatalan mengembalikan deposit dan unitnya utuh.</p>
      </div>

      {galat && <div className="pesan gagal">{galat}</div>}

      {daftar === null && <div className="kartu kosong">Memuat…</div>}
      {daftar?.length === 0 && (
        <div className="kartu kosong">Belum ada pesanan. Buka halaman Pesan untuk memesan.</div>
      )}

      {daftar?.map((p) => {
        const l = LENCANA[p.status] ?? { teks: p.status, kelas: '' };
        return (
          <div className="kartu" key={p.id}>
            <div className="kartu-kepala">
              <div>
                <h3>{keTanggal(p.tanggal)}</h3>
                <div className="jejak">
                  Pesanan #{p.id} · {p.alamatAntar}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className={`lencana ${l.kelas}`}>{l.teks}</span>
                <div className="angka-besar" style={{ fontSize: '1.35rem' }}>
                  {keRupiah(p.total)}
                </div>
              </div>
            </div>

            <div className="baris">
              <button className="tombol sekunder" onClick={() => bukaRincian(p.id)}>
                {rinci[p.id] ? 'Tutup rincian' : 'Lihat rincian'}
              </button>
              {p.status === 'confirmed' && (
                <button
                  className="tombol bahaya"
                  disabled={sibuk === p.id}
                  onClick={() => batalkan(p.id)}
                >
                  {sibuk === p.id ? 'Membatalkan…' : 'Batalkan'}
                </button>
              )}
            </div>

            {rinci[p.id] && (
              <table style={{ marginTop: '0.85rem' }}>
                <thead>
                  <tr>
                    <th>Menu</th>
                    <th className="angka">Unit</th>
                    <th className="angka">Harga satuan</th>
                    <th className="angka">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {rinci[p.id].item.map((i) => (
                    <tr key={i.dailyMenuItemId}>
                      <td>{i.nama}</td>
                      <td className="angka">{i.jumlah}</td>
                      <td className="angka">{keRupiah(i.hargaSatuan)}</td>
                      <td className="angka">{keRupiah(i.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </>
  );
}
