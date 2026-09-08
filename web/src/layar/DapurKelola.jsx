import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { keRupiah, keTanggal, keWaktu, hariIniWib } from '../format.js';

export function DapurKelola() {
  const [menu, setMenu] = useState([]);
  const [antrean, setAntrean] = useState([]);
  const [toko, setToko] = useState([]);
  const [koreksi, setKoreksi] = useState({});
  const [galat, setGalat] = useState(null);
  const [sukses, setSukses] = useState(null);
  const [sibuk, setSibuk] = useState(null);

  const [menuBaru, setMenuBaru] = useState({ nama: '', deskripsi: '', harga: '' });
  const [hari, setHari] = useState({ tanggal: '', jam: '06:00' });
  const [kuota, setKuota] = useState({});

  const muat = useCallback(() => {
    Promise.all([
      api.get('/dapur/menu-items'),
      api.get('/dapur/topups'),
      api.get('/dapur/toko'),
    ])
      .then(([m, t, k]) => {
        setMenu(m.item);
        setAntrean(t.topup);
        setToko(k.toko);
      })
      .catch((e) => setGalat(e.message));
  }, []);

  useEffect(muat, [muat]);

  function lapor(fn) {
    return async (e) => {
      e?.preventDefault?.();
      setGalat(null);
      setSukses(null);
      try {
        await fn();
        muat();
      } catch (err) {
        setGalat(err.message);
      }
    };
  }

  const tambahMenu = lapor(async () => {
    await api.post('/dapur/menu-items', {
      nama: menuBaru.nama,
      deskripsi: menuBaru.deskripsi,
      harga: Number(menuBaru.harga),
    });
    setMenuBaru({ nama: '', deskripsi: '', harga: '' });
    setSukses('Menu ditambahkan ke katalog.');
  });

  const bukaHari = lapor(async () => {
    const item = Object.entries(kuota)
      .map(([id, k]) => ({ menuItemId: Number(id), kuota: Number(k) }))
      .filter((i) => i.kuota > 0);

    // Batas waktu dikirim sebagai waktu WIB eksplisit (+07:00). Kalau dikirim
    // tanpa zona, server akan menafsirkannya menurut zonanya sendiri — dan
    // server produksi hampir selalu berjalan di UTC.
    await api.post('/dapur/service-days', {
      tanggal: hari.tanggal,
      batasWaktuPesan: `${hari.tanggal}T${hari.jam}:00+07:00`,
      item,
    });
    setKuota({});
    setSukses(`Tanggal ${keTanggal(hari.tanggal)} dibuka.`);
  });

  async function ubahAktif(id, aktif) {
    setSibuk(id);
    setGalat(null);
    setSukses(null);
    try {
      await api.post(`/dapur/toko/${id}/${aktif ? 'aktifkan' : 'nonaktifkan'}`);
      setSukses(aktif ? 'Toko diaktifkan kembali.' : 'Toko dinonaktifkan. Sesinya ikut diputus.');
      muat();
    } catch (e) {
      setGalat(e.message);
    } finally {
      setSibuk(null);
    }
  }

  async function kirimKoreksi(id) {
    const isian = koreksi[id] ?? {};
    setSibuk(id);
    setGalat(null);
    setSukses(null);
    try {
      await api.post(`/dapur/toko/${id}/koreksi-deposit`, {
        jumlah: Number(isian.jumlah),
        catatan: isian.catatan ?? '',
      });
      setKoreksi((v) => ({ ...v, [id]: null }));
      setSukses('Deposit dikoreksi. Alasannya tercatat di buku besar toko.');
      muat();
    } catch (e) {
      setGalat(e.message);
    } finally {
      setSibuk(null);
    }
  }

  async function tinjau(id, keputusan) {
    setSibuk(id);
    setGalat(null);
    try {
      await api.post(`/dapur/topups/${id}/${keputusan}`);
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
        <h1>Kelola</h1>
        <p>Katalog menu, pembukaan hari produksi, dan antrean pengisian deposit toko.</p>
      </div>

      {galat && <div className="pesan gagal">{galat}</div>}
      {sukses && <div className="pesan berhasil">{sukses}</div>}

      <div className="kartu">
        <div className="kartu-kepala">
          <h2>Antrean isi deposit</h2>
          <span className="lencana kunyit">{antrean.length} menunggu</span>
        </div>

        {antrean.length === 0 && <div className="kosong">Tidak ada yang menunggu ditinjau.</div>}
        {antrean.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Toko</th>
                <th>Catatan bukti</th>
                <th>Waktu</th>
                <th className="angka">Nominal</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {antrean.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.nama}</strong>
                    <div className="jejak">{t.email}</div>
                  </td>
                  <td>{t.catatanBukti || '—'}</td>
                  <td>{keWaktu(t.dibuatPada)}</td>
                  <td className="angka">{keRupiah(t.nominal)}</td>
                  <td>
                    <div className="baris">
                      <button
                        className="tombol"
                        disabled={sibuk === t.id}
                        onClick={() => tinjau(t.id, 'approve')}
                      >
                        Setujui
                      </button>
                      <button
                        className="tombol bahaya"
                        disabled={sibuk === t.id}
                        onClick={() => tinjau(t.id, 'reject')}
                      >
                        Tolak
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="kartu">
        <div className="kartu-kepala">
          <h2>Toko terdaftar</h2>
          <span className="lencana">{toko.filter((t) => t.aktif).length} aktif</span>
        </div>
        <p className="jejak" style={{ marginTop: 0 }}>
          Menonaktifkan toko memutus sesinya saat itu juga, tapi tidak menghapus riwayat
          pesanan maupun buku besarnya.
        </p>

        {toko.length === 0 && <div className="kosong">Belum ada toko yang mendaftar.</div>}
        {toko.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Toko</th>
                <th className="angka">Deposit</th>
                <th className="angka">Pesanan</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {toko.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.nama}</strong>
                    <div className="jejak">
                      {[t.pic, t.telepon].filter(Boolean).join(' · ') || t.email}
                    </div>
                  </td>
                  <td className="angka">{keRupiah(t.saldo)}</td>
                  <td className="angka">{t.jumlahPesanan}</td>
                  <td>
                    <span className={`lencana ${t.aktif ? '' : 'merah'}`}>
                      {t.aktif ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td>
                    <div className="baris">
                      <button
                        className="tombol sekunder"
                        disabled={sibuk === t.id}
                        onClick={() =>
                          setKoreksi((v) => ({
                            ...v,
                            [t.id]: v[t.id] ? null : { jumlah: '', catatan: '' },
                          }))
                        }
                      >
                        Koreksi deposit
                      </button>
                      <button
                        className={`tombol ${t.aktif ? 'bahaya' : 'sekunder'}`}
                        disabled={sibuk === t.id}
                        onClick={() => ubahAktif(t.id, !t.aktif)}
                      >
                        {t.aktif ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                    </div>

                    {koreksi[t.id] && (
                      <div className="baris" style={{ marginTop: '0.6rem' }}>
                        <div className="bidang" style={{ marginBottom: 0 }}>
                          <label htmlFor={`jml-${t.id}`}>Jumlah (boleh minus)</label>
                          <input
                            id={`jml-${t.id}`}
                            type="number"
                            step="1"
                            placeholder="-200000"
                            value={koreksi[t.id].jumlah}
                            onChange={(e) =>
                              setKoreksi((v) => ({
                                ...v,
                                [t.id]: { ...v[t.id], jumlah: e.target.value },
                              }))
                            }
                          />
                        </div>
                        <div className="bidang" style={{ marginBottom: 0, flex: 1 }}>
                          <label htmlFor={`cat-${t.id}`}>Alasan (wajib)</label>
                          <input
                            id={`cat-${t.id}`}
                            placeholder="mis. transfer tidak masuk"
                            value={koreksi[t.id].catatan}
                            onChange={(e) =>
                              setKoreksi((v) => ({
                                ...v,
                                [t.id]: { ...v[t.id], catatan: e.target.value },
                              }))
                            }
                          />
                        </div>
                        <button
                          className="tombol"
                          disabled={sibuk === t.id}
                          onClick={() => kirimKoreksi(t.id)}
                        >
                          Simpan
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <form className="kartu" onSubmit={bukaHari}>
        <h2>Buka hari produksi</h2>
        <p className="jejak" style={{ marginTop: 0 }}>
          Kuota adalah batas unit yang sanggup dimasak. Kuota nol berarti menu itu tidak diproduksi hari tersebut.
        </p>

        <div className="baris" style={{ marginBottom: '0.9rem' }}>
          <div className="bidang" style={{ marginBottom: 0 }}>
            <label htmlFor="tglBuka">Tanggal</label>
            <input
              id="tglBuka"
              type="date"
              min={hariIniWib()}
              value={hari.tanggal}
              onChange={(e) => setHari((v) => ({ ...v, tanggal: e.target.value }))}
              required
            />
          </div>
          <div className="bidang" style={{ marginBottom: 0 }}>
            <label htmlFor="jamBuka">Batas pesan (WIB)</label>
            <input
              id="jamBuka"
              type="time"
              value={hari.jam}
              onChange={(e) => setHari((v) => ({ ...v, jam: e.target.value }))}
              required
            />
          </div>
        </div>

        {menu.length === 0 && <div className="kosong">Tambahkan menu dulu di bawah.</div>}
        {menu.length > 0 && (
          <table style={{ marginBottom: '0.9rem' }}>
            <thead>
              <tr>
                <th>Menu</th>
                <th className="angka">Harga</th>
                <th className="angka">Kuota</th>
              </tr>
            </thead>
            <tbody>
              {menu.map((m) => (
                <tr key={m.id}>
                  <td>{m.nama}</td>
                  <td className="angka">{keRupiah(m.harga)}</td>
                  <td className="angka">
                    <input
                      className="jumlah"
                      type="number"
                      min="0"
                      value={kuota[m.id] ?? ''}
                      onChange={(e) => setKuota((v) => ({ ...v, [m.id]: e.target.value }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <button className="tombol" type="submit" disabled={menu.length === 0}>
          Buka tanggal ini
        </button>
      </form>

      <form className="kartu" onSubmit={tambahMenu}>
        <h2>Tambah menu ke katalog</h2>
        <div className="bidang">
          <label htmlFor="namaMenu">Nama</label>
          <input
            id="namaMenu"
            value={menuBaru.nama}
            onChange={(e) => setMenuBaru((v) => ({ ...v, nama: e.target.value }))}
            required
          />
        </div>
        <div className="bidang">
          <label htmlFor="deskMenu">Deskripsi</label>
          <input
            id="deskMenu"
            value={menuBaru.deskripsi}
            onChange={(e) => setMenuBaru((v) => ({ ...v, deskripsi: e.target.value }))}
          />
        </div>
        <div className="bidang">
          <label htmlFor="hargaMenu">Harga (rupiah)</label>
          <input
            id="hargaMenu"
            type="number"
            min="1"
            value={menuBaru.harga}
            onChange={(e) => setMenuBaru((v) => ({ ...v, harga: e.target.value }))}
            required
          />
        </div>
        <button className="tombol" type="submit">
          Tambahkan
        </button>
      </form>
    </>
  );
}
