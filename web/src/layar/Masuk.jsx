import { useState } from 'react';
import { useAuth } from '../auth.jsx';

export function Masuk() {
  const { masuk, daftar } = useAuth();
  const [modeDaftar, setModeDaftar] = useState(false);
  const [isian, setIsian] = useState({
    email: '',
    kataSandi: '',
    nama: '',
    telepon: '',
    alamat: '',
  });
  const [galat, setGalat] = useState(null);
  const [sibuk, setSibuk] = useState(false);

  const ubah = (kunci) => (e) => setIsian((v) => ({ ...v, [kunci]: e.target.value }));

  async function kirim(e) {
    e.preventDefault();
    setGalat(null);
    setSibuk(true);
    try {
      if (modeDaftar) await daftar(isian);
      else await masuk(isian.email, isian.kataSandi);
    } catch (err) {
      setGalat(err.message);
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div className="masuk-bungkus">
      <div className="judul-layar">
        <h1>{modeDaftar ? 'Buat akun' : 'Masuk'}</h1>
        <p>
          {modeDaftar
            ? 'Isi saldo di muka, lalu pesan untuk hari yang kamu mau.'
            : 'Makan lengkap, tinggal panaskan.'}
        </p>
      </div>

      <form className="kartu" onSubmit={kirim}>
        {galat && <div className="pesan gagal">{galat}</div>}

        <div className="bidang">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={isian.email}
            onChange={ubah('email')}
            required
          />
        </div>

        <div className="bidang">
          <label htmlFor="kataSandi">Kata sandi</label>
          <input
            id="kataSandi"
            type="password"
            autoComplete={modeDaftar ? 'new-password' : 'current-password'}
            value={isian.kataSandi}
            onChange={ubah('kataSandi')}
            required
          />
        </div>

        {modeDaftar && (
          <>
            <div className="bidang">
              <label htmlFor="nama">Nama</label>
              <input id="nama" value={isian.nama} onChange={ubah('nama')} required />
            </div>
            <div className="bidang">
              <label htmlFor="telepon">Nomor telepon</label>
              <input id="telepon" value={isian.telepon} onChange={ubah('telepon')} />
            </div>
            <div className="bidang">
              <label htmlFor="alamat">Alamat pengantaran</label>
              <textarea id="alamat" rows={2} value={isian.alamat} onChange={ubah('alamat')} />
            </div>
          </>
        )}

        <button className="tombol" type="submit" disabled={sibuk}>
          {sibuk ? 'Sebentar…' : modeDaftar ? 'Daftar' : 'Masuk'}
        </button>
      </form>

      <p className="jejak" style={{ textAlign: 'center' }}>
        {modeDaftar ? 'Sudah punya akun? ' : 'Belum punya akun? '}
        <button
          type="button"
          className="tombol sekunder"
          style={{ padding: '0.2rem 0.6rem' }}
          onClick={() => {
            setModeDaftar((v) => !v);
            setGalat(null);
          }}
        >
          {modeDaftar ? 'Masuk' : 'Daftar'}
        </button>
      </p>
    </div>
  );
}
