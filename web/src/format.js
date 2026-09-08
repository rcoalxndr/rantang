const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

export function keRupiah(nilai) {
  return rupiah.format(Number(nilai ?? 0));
}

const tanggalPanjang = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Asia/Jakarta',
});

/**
 * Tanggal dari server berbentuk 'YYYY-MM-DD'. Diurai sebagai tengah malam UTC
 * lalu ditampilkan dalam zona Asia/Jakarta — hasilnya jatuh di hari yang sama
 * (pukul 07.00 WIB), bukan mundur sehari seperti kalau zonanya dibiarkan
 * mengikuti mesin.
 */
export function keTanggal(teks) {
  if (!teks) return '';
  return tanggalPanjang.format(new Date(`${teks}T00:00:00Z`));
}

const waktuPendek = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Jakarta',
});

export function keWaktu(iso) {
  if (!iso) return '';
  return `${waktuPendek.format(new Date(iso))} WIB`;
}

/** Tanggal hari ini menurut kalender WIB, dalam bentuk 'YYYY-MM-DD'. */
export function hariIniWib() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
}
