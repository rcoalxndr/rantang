/**
 * Header keamanan, ditulis sendiri alih-alih memakai helmet.
 *
 * Yang dipasang cuma yang benar-benar relevan untuk aplikasi ini, dan tiap
 * baris bisa dijelaskan. Paket seperti helmet memasang belasan header sekaligus
 * — sebagian tidak berlaku di sini, dan yang tidak dipahami tidak bisa
 * dipelihara.
 */
export function headerKeamanan(_req, res, next) {
  // Melarang browser menebak-nebak tipe berkas. Tanpa ini, respons yang
  // seharusnya teks bisa diperlakukan sebagai skrip.
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Melarang halaman ini disematkan di dalam iframe situs lain — pertahanan
  // terhadap clickjacking, di mana korban mengira menekan tombol di situs lain
  // padahal menekan tombol di sini.
  res.setHeader('X-Frame-Options', 'DENY');

  // Alamat halaman ini tidak ikut terkirim saat pengguna menuju situs lain.
  res.setHeader('Referrer-Policy', 'no-referrer');

  // Aplikasi ini tidak butuh kamera, mikrofon, maupun lokasi. Menyatakannya
  // eksplisit berarti skrip pihak ketiga yang entah bagaimana masuk pun tidak
  // bisa memintanya.
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // Membatasi dari mana skrip dan gaya boleh dimuat. Ini lapisan pertahanan
  // kedua terhadap XSS: andai penyerang berhasil menyisipkan tag <script>,
  // browser tetap menolak menjalankannya kecuali berasal dari asal kita sendiri.
  //
  // 'unsafe-inline' untuk style diperlukan karena React menulis sebagian gaya
  // langsung ke atribut style. Font diizinkan dari Google Fonts karena itu yang
  // dipakai halamannya.
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );

  next();
}
