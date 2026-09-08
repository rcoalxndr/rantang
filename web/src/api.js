/**
 * Pembungkus fetch untuk seluruh aplikasi.
 *
 * Semua permintaan lewat sini supaya satu hal berlaku di mana-mana: error dari
 * server (yang selalu berbentuk { error: { code, message } }) diubah jadi objek
 * KesalahanApi, sehingga komponen cukup menangkap dan menampilkan `.pesan` —
 * tidak ada komponen yang perlu tahu bentuk JSON error.
 */
export class KesalahanApi extends Error {
  constructor(status, kode, pesan) {
    super(pesan);
    this.name = 'KesalahanApi';
    this.status = status;
    this.kode = kode;
  }
}

async function minta(jalur, { method = 'GET', body, headers } = {}) {
  let res;
  try {
    res = await fetch(`/api${jalur}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(headers ?? {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      // Cookie sesi httpOnly ikut terkirim. 'same-origin' cukup karena proxy
      // Vite membuat frontend dan backend berbagi asal yang sama.
      credentials: 'same-origin',
    });
  } catch {
    throw new KesalahanApi(0, 'TIDAK_TERHUBUNG', 'Tidak bisa menghubungi server. Sudah jalan?');
  }

  if (res.status === 204) return null;

  const isi = await res.json().catch(() => null);

  if (!res.ok) {
    const e = isi?.error ?? {};
    throw new KesalahanApi(
      res.status,
      e.code ?? 'TIDAK_DIKETAHUI',
      e.message ?? 'Terjadi kesalahan yang tidak terduga.'
    );
  }

  return isi;
}

export const api = {
  get: (jalur) => minta(jalur),
  post: (jalur, body, headers) => minta(jalur, { method: 'POST', body, headers }),
};
