-- Dua tabel untuk membuat sistem ini tahan dipakai orang sungguhan.

-- 1. Pembatasan laju.
--
-- Satu baris per "kunci" (mis. 'masuk:rico@contoh.test' atau 'daftar:1.2.3.4),
-- menyimpan berapa kali percobaan terjadi dan kapan jendela hitungnya mulai.
--
-- Disimpan di database, bukan di memori, karena di Vercel setiap permintaan
-- bisa dilayani instance yang berbeda — penghitung di memori akan lupa segalanya
-- dan tidak membatasi apa pun.
CREATE TABLE pembatasan_laju (
  kunci  TEXT        PRIMARY KEY,
  jumlah INTEGER     NOT NULL DEFAULT 0,
  mulai  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT jumlah_tidak_minus CHECK (jumlah >= 0)
);

CREATE INDEX pembatasan_laju_mulai_idx ON pembatasan_laju (mulai);

-- 2. Kunci idempotensi.
--
-- Klik ganda pada tombol Pesan mengirim dua permintaan identik. Tanpa penjagaan,
-- keduanya jadi pesanan terpisah dan deposit terpotong dua kali — dan pelanggan
-- yang mengalaminya tidak akan percaya lagi.
--
-- Klien mengirim kunci acak sekali per niat memesan. Kunci yang sama hanya boleh
-- menghasilkan satu pesanan; permintaan kedua mengembalikan pesanan yang sama,
-- bukan membuat yang baru.
CREATE TABLE kunci_idempotensi (
  kunci       TEXT        PRIMARY KEY,
  user_id     BIGINT      NOT NULL REFERENCES users(id),
  order_id    BIGINT      REFERENCES orders(id),
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX kunci_idempotensi_dibuat_idx ON kunci_idempotensi (dibuat_pada);

COMMENT ON TABLE pembatasan_laju   IS 'Penghitung percobaan per kunci, dengan jendela waktu.';
COMMENT ON TABLE kunci_idempotensi IS 'Menjamin satu niat memesan menghasilkan tepat satu pesanan.';
