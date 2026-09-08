-- Dua hal yang dibutuhkan begitu sistem ini dipakai orang sungguhan.

-- 1. Akun bisa dinonaktifkan.
--
-- Toko yang berhenti berlangganan, akun yang dibuat iseng, atau akun yang
-- disalahgunakan harus bisa dihentikan. Yang TIDAK boleh adalah menghapusnya:
-- pesanan dan buku besarnya adalah catatan sejarah yang menyentuh uang, dan
-- foreign key memang sengaja melarang penghapusan itu.
--
-- Menonaktifkan, bukan menghapus — pola yang sama seperti pesanan yang
-- dibatalkan.
ALTER TABLE users ADD COLUMN aktif BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX users_aktif_idx ON users (aktif) WHERE NOT aktif;

-- 2. Buku besar menerima jenis 'koreksi'.
--
-- Dapur bisa salah: menyetujui transfer yang ternyata tidak masuk, atau salah
-- membaca nominalnya. Tanpa jalur koreksi, satu-satunya cara membetulkan adalah
-- menyunting angka langsung di database — dan itu menghancurkan gunanya buku
-- besar sebagai jejak audit.
--
-- Koreksi dicatat sebagai baris BARU bernilai positif atau negatif, dengan
-- catatan wajib. Baris lama tidak pernah diubah maupun dihapus.
ALTER TABLE credit_ledger DROP CONSTRAINT jenis_valid;

ALTER TABLE credit_ledger
  ADD CONSTRAINT jenis_valid CHECK (jenis IN ('topup', 'order', 'refund', 'koreksi'));

COMMENT ON COLUMN users.aktif IS 'Akun nonaktif tidak bisa masuk; datanya tetap utuh.';
