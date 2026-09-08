import { useAuth } from './auth.jsx';
import { useRute } from './rute.js';
import { Masuk } from './layar/Masuk.jsx';
import { Menu } from './layar/Menu.jsx';
import { Pesanan } from './layar/Pesanan.jsx';
import { Saldo } from './layar/Saldo.jsx';
import { DapurHari } from './layar/DapurHari.jsx';
import { DapurKelola } from './layar/DapurKelola.jsx';

const RUTE_TOKO = [
  { jalur: '/', label: 'Pesan' },
  { jalur: '/pesanan', label: 'Pesanan toko' },
  { jalur: '/saldo', label: 'Deposit' },
];

const RUTE_DAPUR = [
  { jalur: '/', label: 'Hari produksi' },
  { jalur: '/kelola', label: 'Kelola' },
];

export function App() {
  const { user, memuat, keluar } = useAuth();
  const [rute, pergiKe] = useRute();

  if (memuat) {
    return (
      <main>
        <div className="kartu kosong">Memuat…</div>
      </main>
    );
  }

  if (!user) {
    return (
      <>
        <Bilah />
        <main>
          <Masuk />
        </main>
      </>
    );
  }

  const dapur = user.peran === 'dapur';
  const daftarRute = dapur ? RUTE_DAPUR : RUTE_TOKO;

  // Peta rute dipilih berdasarkan peran, jadi akun toko tidak punya jalan masuk
  // ke layar dapur sama sekali. Ini kenyamanan, BUKAN keamanan — yang benar-benar
  // menjaga adalah middleware wajibPeran di server. Menyembunyikan tombol tidak
  // menghentikan siapa pun yang mengetik alamatnya sendiri.
  let isi;
  if (dapur) {
    isi = rute === '/kelola' ? <DapurKelola /> : <DapurHari />;
  } else if (rute === '/pesanan') {
    isi = <Pesanan />;
  } else if (rute === '/saldo') {
    isi = <Saldo />;
  } else {
    isi = <Menu keDeposit={() => pergiKe('/saldo')} />;
  }

  return (
    <>
      <Bilah>
        <nav>
          {daftarRute.map((r) => (
            <button
              key={r.jalur}
              onClick={() => pergiKe(r.jalur)}
              aria-current={rute === r.jalur ? 'page' : undefined}
            >
              {r.label}
            </button>
          ))}
        </nav>
        <div className="aku">
          <span>
            {user.nama}
            {dapur && ' · dapur'}
          </span>
          <button className="tombol sekunder" style={{ color: '#fff' }} onClick={keluar}>
            Keluar
          </button>
        </div>
      </Bilah>
      <main>{isi}</main>
    </>
  );
}

function Bilah({ children }) {
  return (
    <header className="bilah">
      <div className="bilah-isi">
        <div className="merek">
          Rantang
          <small>Makan lengkap, tinggal panaskan</small>
        </div>
        {children}
      </div>
    </header>
  );
}
