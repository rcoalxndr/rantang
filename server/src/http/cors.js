const ORIGIN_DIIZINKAN = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

/**
 * CORS ditulis sendiri, bukan memakai paket `cors`.
 *
 * Aturan yang perlu dipahami dan gampang salah:
 *
 * 1. `Access-Control-Allow-Origin` TIDAK BOLEH `*` kalau kredensial ikut
 *    dikirim. Browser menolak kombinasi itu mentah-mentah. Karena itu origin
 *    yang masuk dicocokkan ke daftar, lalu dipantulkan kembali apa adanya.
 * 2. `Vary: Origin` wajib, kalau tidak cache akan menyimpan jawaban untuk satu
 *    origin lalu menyajikannya ke origin lain.
 * 3. Permintaan OPTIONS (preflight) harus dijawab sendiri dan berhenti di sini.
 *
 * CORS membatasi apa yang boleh dibaca JavaScript di browser lain. Ini bukan
 * pengganti autentikasi — permintaan dari luar browser mengabaikannya
 * sepenuhnya.
 */
export function cors(req, res, next) {
  const asal = req.headers.origin;

  if (asal && ORIGIN_DIIZINKAN.includes(asal)) {
    res.setHeader('Access-Control-Allow-Origin', asal);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
    return res.status(204).end();
  }

  next();
}
