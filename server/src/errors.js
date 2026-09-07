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
