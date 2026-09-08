-- Konsep bisnis Rantang berpindah dari langganan langsung ke konsumen menjadi
-- penyaluran ke toserba, mengikuti cara kerja konbini Jepang: toko memesan
-- sejumlah unit sebelum batas waktu, membelinya putus, dan menanggung sendiri
-- risiko barang yang tidak laku.
--
-- Bentuk transaksinya tidak berubah sama sekali — yang berganti hanya siapa
-- yang memesan. Migrasi ini menyesuaikan kosakatanya:
--   peran 'customer' -> 'toko'
--   peran 'kitchen'  -> 'dapur'
-- dan menambah kolom PIC, karena yang dihubungi dapur adalah orang di toko,
-- bukan tokonya.

ALTER TABLE users ALTER COLUMN peran DROP DEFAULT;

-- Batasan lama harus dilepas dulu; kalau tidak, UPDATE di bawah akan ditolak
-- karena 'toko' belum termasuk nilai yang diizinkan.
ALTER TABLE users DROP CONSTRAINT peran_valid;

UPDATE users
SET peran = CASE peran
  WHEN 'customer' THEN 'toko'
  WHEN 'kitchen'  THEN 'dapur'
  ELSE peran
END;

ALTER TABLE users ADD CONSTRAINT peran_valid CHECK (peran IN ('toko', 'dapur'));
ALTER TABLE users ALTER COLUMN peran SET DEFAULT 'toko';

-- Penanggung jawab di toko: nama orang yang dihubungi saat pengiriman.
ALTER TABLE users ADD COLUMN pic TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN users.nama   IS 'Nama toko (untuk peran toko) atau nama unit dapur.';
COMMENT ON COLUMN users.pic    IS 'Nama penanggung jawab di toko.';
COMMENT ON COLUMN users.alamat IS 'Alamat toko, disalin ke orders.alamat_antar saat memesan.';
