export const NAMA_COOKIE_SESI = 'rantang_sesi';

// SameSite=Lax cukup selama frontend dan backend berbagi asal yang sama —
// di pengembangan lewat proxy Vite, di produksi lewat satu domain.
// Kalau suatu saat keduanya benar-benar beda domain, setel COOKIE_SAMESITE=None
// dan COOKIE_SECURE=true; browser menolak SameSite=None tanpa Secure.
const SAMESITE = process.env.COOKIE_SAMESITE ?? 'Lax';
const SECURE = process.env.COOKIE_SECURE === 'true';

/**
 * Memecah header Cookie jadi objek biasa.
 * Ditulis sendiri alih-alih memakai cookie-parser: enam baris, dan isinya
 * justru yang perlu terlihat.
 */
export function bacaCookie(req, _res, next) {
  const header = req.headers.cookie ?? '';
  req.cookies = Object.fromEntries(
    header
      .split(';')
      .map((bagian) => bagian.trim())
      .filter(Boolean)
      .map((bagian) => {
        const pisah = bagian.indexOf('=');
        if (pisah === -1) return [bagian, ''];
        return [bagian.slice(0, pisah), decodeURIComponent(bagian.slice(pisah + 1))];
      })
  );
  next();
}

export function pasangCookieSesi(res, sesi) {
  res.cookie(NAMA_COOKIE_SESI, sesi.id, {
    // httpOnly: JavaScript di halaman tidak bisa membaca cookie ini sama sekali.
    // Inilah alasan utama memilih cookie sesi ketimbang token di localStorage:
    // satu celah XSS tidak otomatis berarti token melayang.
    httpOnly: true,
    sameSite: SAMESITE,
    secure: SECURE,
    path: '/',
    expires: new Date(sesi.kedaluwarsa),
  });
}

export function hapusCookieSesi(res) {
  res.clearCookie(NAMA_COOKIE_SESI, {
    httpOnly: true,
    sameSite: SAMESITE,
    secure: SECURE,
    path: '/',
  });
}
