/**
 * Error domain: kesalahan yang berasal dari aturan bisnis, bukan dari bug.
 *
 * Setiap error membawa `kode` (dibaca mesin, dikirim ke klien apa adanya) dan
 * `status` (kode HTTP). Lapisan route cukup menerjemahkan keduanya, sehingga
 * logika bisnis tidak perlu tahu apa pun tentang HTTP.
 */
export class KesalahanDomain extends Error {
  constructor(kode, pesan, status = 400) {
    super(pesan);
    this.name = new.target.name;
    this.kode = kode;
    this.status = status;
  }
}

export class KataSandiTerlaluPendek extends KesalahanDomain {
  constructor() {
    super('KATA_SANDI_TERLALU_PENDEK', 'Kata sandi minimal 8 karakter.', 422);
  }
}

export class EmailTidakValid extends KesalahanDomain {
  constructor() {
    super('EMAIL_TIDAK_VALID', 'Format email tidak valid.', 422);
  }
}

export class EmailSudahDipakai extends KesalahanDomain {
  constructor() {
    super('EMAIL_SUDAH_DIPAKAI', 'Email ini sudah terdaftar.', 409);
  }
}

export class KredensialSalah extends KesalahanDomain {
  constructor() {
    super('KREDENSIAL_SALAH', 'Email atau kata sandi salah.', 401);
  }
}

export class BelumMasuk extends KesalahanDomain {
  constructor() {
    super('BELUM_MASUK', 'Kamu harus masuk terlebih dahulu.', 401);
  }
}

export class TidakBerwenang extends KesalahanDomain {
  constructor() {
    super('TIDAK_BERWENANG', 'Kamu tidak berhak mengakses ini.', 403);
  }
}

export class NamaKosong extends KesalahanDomain {
  constructor() {
    super('NAMA_KOSONG', 'Nama tidak boleh kosong.', 422);
  }
}

export class TanggalTidakValid extends KesalahanDomain {
  constructor() {
    super('TANGGAL_TIDAK_VALID', 'Tanggal harus berformat YYYY-MM-DD dan benar-benar ada.', 422);
  }
}

export class BatasWaktuTidakValid extends KesalahanDomain {
  constructor() {
    super(
      'BATAS_WAKTU_TIDAK_VALID',
      'Batas waktu pesan harus waktu yang sah dan jatuh sebelum hari layanan berakhir.',
      422
    );
  }
}

export class TanggalSudahDibuka extends KesalahanDomain {
  constructor() {
    super('TANGGAL_SUDAH_DIBUKA', 'Tanggal layanan ini sudah pernah dibuka.', 409);
  }
}

export class TanggalLayananTidakDitemukan extends KesalahanDomain {
  constructor() {
    super('TANGGAL_LAYANAN_TIDAK_DITEMUKAN', 'Belum ada layanan untuk tanggal ini.', 404);
  }
}

export class MenuTidakDitemukan extends KesalahanDomain {
  constructor() {
    super('MENU_TIDAK_DITEMUKAN', 'Menu tidak ditemukan atau sudah tidak aktif.', 404);
  }
}

export class MenuGandaDiTanggalSama extends KesalahanDomain {
  constructor() {
    super('MENU_GANDA', 'Satu menu hanya boleh didaftarkan sekali per tanggal.', 409);
  }
}

export class KuotaTidakValid extends KesalahanDomain {
  constructor() {
    super('KUOTA_TIDAK_VALID', 'Kuota harus bilangan bulat lebih dari nol.', 422);
  }
}

export class HargaTidakValid extends KesalahanDomain {
  constructor() {
    super('HARGA_TIDAK_VALID', 'Harga harus bilangan bulat rupiah lebih dari nol.', 422);
  }
}

export class DaftarMenuKosong extends KesalahanDomain {
  constructor() {
    super('DAFTAR_MENU_KOSONG', 'Tanggal layanan harus punya minimal satu menu.', 422);
  }
}

export class KuotaHabis extends KesalahanDomain {
  constructor() {
    super('KUOTA_HABIS', 'Unit untuk menu ini sudah habis.', 409);
  }
}

export class SaldoTidakCukup extends KesalahanDomain {
  constructor() {
    super('SALDO_TIDAK_CUKUP', 'Saldomu tidak cukup untuk pesanan ini.', 409);
  }
}

export class LewatBatasWaktu extends KesalahanDomain {
  constructor() {
    super('LEWAT_BATAS_WAKTU', 'Pemesanan untuk tanggal ini sudah ditutup.', 403);
  }
}

export class JumlahTidakValid extends KesalahanDomain {
  constructor() {
    super('JUMLAH_TIDAK_VALID', 'Jumlah unit harus bilangan bulat lebih dari nol.', 422);
  }
}

export class ItemPesananKosong extends KesalahanDomain {
  constructor() {
    super('ITEM_PESANAN_KOSONG', 'Pesanan harus berisi minimal satu menu.', 422);
  }
}

export class ItemMenuTidakDitemukan extends KesalahanDomain {
  constructor() {
    super('ITEM_MENU_TIDAK_DITEMUKAN', 'Menu itu tidak tersedia di tanggal tersebut.', 404);
  }
}

export class PesananTidakDitemukan extends KesalahanDomain {
  constructor() {
    super('PESANAN_TIDAK_DITEMUKAN', 'Pesanan tidak ditemukan.', 404);
  }
}

export class PesananSudahDibatalkan extends KesalahanDomain {
  constructor() {
    super('PESANAN_SUDAH_DIBATALKAN', 'Pesanan ini sudah dibatalkan sebelumnya.', 409);
  }
}

export class NominalTidakValid extends KesalahanDomain {
  constructor() {
    super('NOMINAL_TIDAK_VALID', 'Nominal harus bilangan bulat rupiah lebih dari nol.', 422);
  }
}

export class TopupTidakDitemukan extends KesalahanDomain {
  constructor() {
    super('TOPUP_TIDAK_DITEMUKAN', 'Pengajuan isi saldo tidak ditemukan.', 404);
  }
}

export class TopupSudahDitinjau extends KesalahanDomain {
  constructor() {
    super('TOPUP_SUDAH_DITINJAU', 'Pengajuan ini sudah pernah ditinjau.', 409);
  }
}

export class PesananSudahDikirim extends KesalahanDomain {
  constructor() {
    super('PESANAN_SUDAH_DIKIRIM', 'Pesanan ini sudah ditandai terkirim.', 409);
  }
}

export class TerlaluSeringMencoba extends KesalahanDomain {
  constructor() {
    super('TERLALU_SERING_MENCOBA', 'Terlalu banyak percobaan. Coba lagi beberapa saat.', 429);
  }
}

export class KunciIdempotensiDipakaiUlang extends KesalahanDomain {
  constructor() {
    super(
      'KUNCI_IDEMPOTENSI_DIPAKAI_ULANG',
      'Kunci permintaan ini sudah dipakai untuk pesanan lain.',
      409
    );
  }
}
