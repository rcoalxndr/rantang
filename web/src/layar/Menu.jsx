import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { keRupiah, keTanggal, keWaktu } from '../format.js';

export function Menu({ keSaldo }) {
  const [tanggalTersedia, setTanggalTersedia] = useState([]);
  const [dipilih, setDipilih] = useState(null);
  const [hari, setHari] = useState(null);
  const [jumlah, setJumlah] = useState({});
  const [galat, setGalat] = useState(null);
  const [sukses, setSukses] = useState(null);
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    api
      .get('/service-days')
      .then((d) => {
        setTanggalTersedia(d.tanggal);
        const pertamaYangBisa = d.tanggal.find((t) => t.masihBisaPesan) ?? d.tanggal[0];
        setDipilih(pertamaYangBisa?.tanggal ?? null);
      })
      .catch((e) => setGalat(e.message));
  }, []);

  useEffect(() => {
    if (!dipilih) return;
    setHari(null);
    setJumlah({});
    api
      .get(`/menu?tanggal=${dipilih}`)
      .then(setHari)
      .catch((e) => setGalat(e.message));
  }, [dipilih]);

  const totalPorsi = Object.values(jumlah).reduce((n, v) => n + (Number(v) || 0), 0);
  const totalHarga =
    hari?.item.reduce((n, i) => n + (Number(jumlah[i.id]) || 0) * i.harga, 0) ?? 0;

  async function pesan() {
    setGalat(null);
    setSukses(null);
    setSibuk(true);
    try {
      const item = Object.entries(jumlah)
        .map(([id, n]) => ({ dailyMenuItemId: Number(id), jumlah: Number(n) }))
        .filter((i) => i.jumlah > 0);

      const d = await api.post('/orders', { tanggal: dipilih, item });
      setSukses(`Pesanan #${d.pesanan.id} masuk. ${keRupiah(d.pesanan.total)} dipotong dari deposit toko.`);
      setJumlah({});
      setHari(await api.get(`/menu?tanggal=${dipilih}`));
    } catch (err) {
      setGalat(err.message);
    } finally {
      setSibuk(false);
    }
  }

  if (galat && !hari) return <div className="pesan gagal">{galat}</div>;

  return (
    <>
      <div className="judul-layar">
        <h1>Pesan</h1>
        <p>Dapur memasak persis sejumlah yang dipesan, jadi unitnya terbatas.</p>
      </div>

      {tanggalTersedia.length === 0 && (
        <div className="kartu kosong">Belum ada tanggal layanan yang dibuka dapur.</div>
      )}

      {tanggalTersedia.length > 0 && (
        <div className="kartu">
          <label htmlFor="tanggal">Tanggal layanan</label>
          <select id="tanggal" value={dipilih ?? ''} onChange={(e) => setDipilih(e.target.value)}>
            {tanggalTersedia.map((t) => (
              <option key={t.tanggal} value={t.tanggal}>
                {keTanggal(t.tanggal)}
                {t.masihBisaPesan ? ` — sisa ${t.sisaTotal} unit` : ' — sudah ditutup'}
              </option>
            ))}
          </select>
        </div>
      )}

      {galat && <div className="pesan gagal">{galat}</div>}
      {sukses && <div className="pesan berhasil">{sukses}</div>}

      {hari && (
        <>
          <div className="kartu">
            <div className="kartu-kepala">
              <h2>{keTanggal(hari.tanggal)}</h2>
              <span className={`lencana ${hari.masihBisaPesan ? '' : 'merah'}`}>
                {hari.masihBisaPesan
                  ? `Pesan sebelum ${keWaktu(hari.batasWaktuPesan)}`
                  : 'Pemesanan ditutup'}
              </span>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Menu</th>
                  <th className="angka">Harga</th>
                  <th className="angka">Sisa</th>
                  <th className="angka">Unit</th>
                </tr>
              </thead>
              <tbody>
                {hari.item.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <strong>{i.nama}</strong>
                      <div className="jejak">{i.deskripsi}</div>
                    </td>
                    <td className="angka">{keRupiah(i.harga)}</td>
                    <td className={`angka ${i.sisa === 0 ? 'sisa-habis' : ''}`}>
                      {i.sisa === 0 ? 'habis' : i.sisa}
                    </td>
                    <td className="angka">
                      <input
                        className="jumlah"
                        type="number"
                        min="0"
                        max={i.sisa}
                        disabled={!hari.masihBisaPesan || i.sisa === 0}
                        value={jumlah[i.id] ?? ''}
                        onChange={(e) =>
                          setJumlah((v) => ({ ...v, [i.id]: e.target.value }))
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="kartu">
            <div className="kartu-kepala">
              <div>
                <div className="jejak">
                  {totalPorsi} unit
                </div>
                <div className="angka-besar">{keRupiah(totalHarga)}</div>
              </div>
              <div className="baris">
                <button className="tombol sekunder" onClick={keSaldo}>
                  Isi deposit
                </button>
                <button
                  className="tombol"
                  disabled={!hari.masihBisaPesan || totalPorsi === 0 || sibuk}
                  onClick={pesan}
                >
                  {sibuk ? 'Memproses…' : 'Pesan sekarang'}
                </button>
              </div>
            </div>
            <p className="jejak" style={{ margin: 0 }}>
              Pesanan bisa dibatalkan penuh selama belum lewat batas waktu. Setelah itu unitnya sudah masuk daftar produksi.
            </p>
          </div>
        </>
      )}
    </>
  );
}
