CREATE TABLE menu_items (
  id        BIGSERIAL PRIMARY KEY,
  nama      TEXT    NOT NULL,
  deskripsi TEXT    NOT NULL DEFAULT '',
  harga     BIGINT  NOT NULL,
  aktif     BOOLEAN NOT NULL DEFAULT true,

  CONSTRAINT harga_positif CHECK (harga > 0)
);

CREATE TABLE service_days (
  tanggal           DATE        PRIMARY KEY,
  status            TEXT        NOT NULL DEFAULT 'open',
  batas_waktu_pesan TIMESTAMPTZ NOT NULL,

  CONSTRAINT status_valid CHECK (status IN ('open', 'closed'))
);

CREATE TABLE daily_menu_items (
  id           BIGSERIAL PRIMARY KEY,
  tanggal      DATE    NOT NULL REFERENCES service_days(tanggal) ON DELETE CASCADE,
  menu_item_id BIGINT  NOT NULL REFERENCES menu_items(id),
  harga        BIGINT  NOT NULL,
  kuota        INTEGER NOT NULL,
  terjual      INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT harga_positif         CHECK (harga > 0),
  CONSTRAINT kuota_positif         CHECK (kuota > 0),
  CONSTRAINT terjual_tidak_minus   CHECK (terjual >= 0),
  CONSTRAINT tidak_over_jual       CHECK (terjual <= kuota),
  CONSTRAINT unik_menu_per_tanggal UNIQUE (tanggal, menu_item_id)
);
