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
