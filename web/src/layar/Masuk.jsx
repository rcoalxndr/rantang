import { useState } from 'react';
import { useAuth } from '../auth.jsx';

export function Masuk() {
  const { masuk, daftar } = useAuth();
  const [modeDaftar, setModeDaftar] = useState(false);
  const [isian, setIsian] = useState({
    email: '',
    kataSandi: '',
    nama: '',
    pic: '',
    telepon: '',
    alamat: '',
  });
  const [galat, setGalat] = useState(null);
  const [sibuk, setSibuk] = useState(false);

  const ubah = (kunci) => (e) => setIsian((v) => ({ ...v, [kunci]: e.target.value }));

  /**
   * Masuk cepat dengan akun contoh.
   *
   * CATATAN: blok ini ada karena aplikasi ini dipakai sebagai demo portofolio —
   * tautannya harus bisa dicoba siapa pun tanpa penjelasan tambahan. Kalau suatu
   * hari ada toko sungguhan yang memakainya, hapus tombol-tombol ini dan ganti
   * kata sandi akun contohnya.
   */
  async function masukContoh(email) {
    setGalat(null);
    setSibuk(true);
    try {
      await masuk(email, 'rantang-demo-2026');
    } catch (err) {
      setGalat(err.message);
    } finally {
      setSibuk(false);
    }
  }

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
        <h1>{modeDaftar ? 'Daftarkan toko' : 'Rantang'}</h1>
        <p>
          {modeDaftar
            ? 'Isi data tokomu. Akun barunya langsung diberi deposit percobaan supaya bisa langsung memesan.'
            : 'Sistem pemesanan makanan siap-santap untuk toserba. Toko memesan sebelum batas waktu, dapur memasak persis sejumlah pesanan.'}
        </p>
      </div>

      {!modeDaftar && (
        <div className="kartu" style={{ background: 'var(--kunyit-muda)', borderColor: '#e8d5b8' }}>
          <h3 style={{ marginBottom: '0.15rem' }}>Baru di sini?</h3>
          <p className="jejak" style={{ marginTop: 0, marginBottom: '0.7rem' }}>
            Daftarkan tokomu sendiri — akun barunya langsung diberi deposit percobaan,
            jadi kamu bisa memesan dan melihat sistemnya bekerja sungguhan.
          </p>
          <button
            className="tombol"
            type="button"
            style={{ width: '100%' }}
            onClick={() => {
              setModeDaftar(true);
              setGalat(null);
            }}
          >
            Daftarkan toko saya
          </button>
          <p className="jejak" style={{ marginBottom: 0, marginTop: '0.8rem' }}>
            Atau lihat-lihat dulu dengan akun contoh:{' '}
            <button
              type="button"
              className="tombol sekunder"
              style={{ padding: '0.15rem 0.5rem', fontSize: '0.85rem' }}
              disabled={sibuk}
              onClick={() => masukContoh('melati@toserba.test')}
            >
              sebagai toko
            </button>{' '}
            <button
              type="button"
              className="tombol sekunder"
              style={{ padding: '0.15rem 0.5rem', fontSize: '0.85rem' }}
              disabled={sibuk}
              onClick={() => masukContoh('dapur@rantang.test')}
            >
              sebagai dapur
            </button>
          </p>
        </div>
      )}

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
              <label htmlFor="nama">Nama toko</label>
              <input id="nama" value={isian.nama} onChange={ubah('nama')} required />
            </div>
            <div className="bidang">
              <label htmlFor="pic">Penanggung jawab (PIC)</label>
              <input id="pic" value={isian.pic} onChange={ubah('pic')} required />
            </div>
            <div className="bidang">
              <label htmlFor="telepon">Nomor telepon</label>
              <input id="telepon" value={isian.telepon} onChange={ubah('telepon')} />
            </div>
            <div className="bidang">
              <label htmlFor="alamat">Alamat toko</label>
              <textarea id="alamat" rows={2} value={isian.alamat} onChange={ubah('alamat')} />
            </div>
          </>
        )}

        <button className="tombol" type="submit" disabled={sibuk}>
          {sibuk ? 'Sebentar…' : modeDaftar ? 'Daftarkan' : 'Masuk'}
        </button>
      </form>

      <p className="jejak" style={{ textAlign: 'center' }}>
        {modeDaftar ? 'Toko sudah terdaftar? ' : 'Toko belum terdaftar? '}
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
