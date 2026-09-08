import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { keRupiah, keTanggal, hariIniWib } from '../format.js';

export function DapurHari() {
  const [tanggal, setTanggal] = useState(() => {
    const d = new Date(`${hariIniWib()}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [produksi, setProduksi] = useState(null);
  const [antar, setAntar] = useState(null);
  const [galat, setGalat] = useState(null);
  const [sibuk, setSibuk] = useState(null);

  const muat = useCallback(() => {
    setGalat(null);
    setProduksi(null);
    setAntar(null);
    Promise.all([
      api.get(`/dapur/production?tanggal=${tanggal}`),
      api.get(`/dapur/deliveries?tanggal=${tanggal}`),
    ])
      .then(([p, a]) => {
        setProduksi(p);
        setAntar(a);
      })
      .catch((e) => setGalat(e.message));
  }, [tanggal]);

  useEffect(muat, [muat]);

  async function tandai(id) {
    setSibuk(id);
    try {
      await api.post(`/dapur/orders/${id}/deliver`);
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
        <h1>Hari produksi</h1>
        <p>Berapa unit yang harus dimasak, dan ke toko mana saja dikirim.</p>
      </div>

      <div className="kartu">
        <label htmlFor="tgl">Tanggal layanan</label>
        <input id="tgl" type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
      </div>

      {galat && <div className="pesan gagal">{galat}</div>}

      {produksi && (
        <div className="kartu">
          <div className="kartu-kepala">
            <div>
              <h2>Daftar produksi</h2>
              <div className="jejak">{keTanggal(produksi.tanggal)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="jejak">Total unit</div>
              <div className="angka-besar">{produksi.totalUnit}</div>
            </div>
          </div>

          {produksi.item.length === 0 && <div className="kosong">Belum ada menu di tanggal ini.</div>}
          {produksi.item.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th className="angka">Masak</th>
                  <th>Menu</th>
                  <th className="angka">Kuota</th>
                  <th className="angka">Sisa</th>
                </tr>
              </thead>
              <tbody>
                {produksi.item.map((i) => (
                  <tr key={i.dailyMenuItemId}>
                    <td className="angka">
                      <strong style={{ fontSize: '1.1rem' }}>{i.jumlah}</strong>
                    </td>
                    <td>{i.nama}</td>
                    <td className="angka">{i.kuota}</td>
                    <td className="angka">{i.kuota - i.terjual}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {antar && (
        <div className="kartu">
          <div className="kartu-kepala">
            <h2>Daftar kirim</h2>
            <span className="lencana">{antar.totalPesanan} pesanan</span>
          </div>

          {antar.pesanan.length === 0 && <div className="kosong">Belum ada pesanan.</div>}
          {antar.pesanan.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Toko</th>
                  <th>Alamat</th>
                  <th>Isi</th>
                  <th className="angka">Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {antar.pesanan.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.nama}</strong>
                      <div className="jejak">
                        {[p.pic, p.telepon].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </td>
                    <td>{p.alamatAntar}</td>
                    <td>
                      {p.item.map((i) => (
                        <div key={i.nama}>
                          {i.jumlah}× {i.nama}
                        </div>
                      ))}
                    </td>
                    <td className="angka">{keRupiah(p.total)}</td>
                    <td>
                      {p.status === 'delivered' ? (
                        <span className="lencana kunyit">Terkirim</span>
                      ) : (
                        <button
                          className="tombol sekunder"
                          disabled={sibuk === p.id}
                          onClick={() => tandai(p.id)}
                        >
                          {sibuk === p.id ? '…' : 'Tandai terkirim'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}
