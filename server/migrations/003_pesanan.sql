CREATE TABLE orders (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT      NOT NULL REFERENCES users(id),
  tanggal_layanan DATE        NOT NULL REFERENCES service_days(tanggal),
  status          TEXT        NOT NULL DEFAULT 'confirmed',
  total           BIGINT      NOT NULL,
  alamat_antar    TEXT        NOT NULL,
  dibuat_pada     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT status_valid  CHECK (status IN ('confirmed', 'cancelled', 'delivered')),
  CONSTRAINT total_positif CHECK (total > 0)
);

CREATE INDEX orders_user_idx    ON orders (user_id);
CREATE INDEX orders_tanggal_idx ON orders (tanggal_layanan);

CREATE TABLE order_items (
  id                 BIGSERIAL PRIMARY KEY,
  order_id           BIGINT  NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  daily_menu_item_id BIGINT  NOT NULL REFERENCES daily_menu_items(id),
  jumlah             INTEGER NOT NULL,
  harga_satuan       BIGINT  NOT NULL,

  CONSTRAINT jumlah_positif       CHECK (jumlah > 0),
  CONSTRAINT harga_satuan_positif CHECK (harga_satuan > 0)
);

CREATE INDEX order_items_order_idx ON order_items (order_id);

CREATE TABLE credit_ledger (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT      NOT NULL REFERENCES users(id),
  jumlah       BIGINT      NOT NULL,
  jenis        TEXT        NOT NULL,
  ref_order_id BIGINT      REFERENCES orders(id),
  catatan      TEXT        NOT NULL DEFAULT '',
  dibuat_pada  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT jenis_valid      CHECK (jenis IN ('topup', 'order', 'refund')),
  CONSTRAINT jumlah_bukan_nol CHECK (jumlah <> 0)
);

CREATE INDEX credit_ledger_user_idx ON credit_ledger (user_id);

CREATE TABLE topup_requests (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT      NOT NULL REFERENCES users(id),
  nominal       BIGINT      NOT NULL,
  catatan_bukti TEXT        NOT NULL DEFAULT '',
  status        TEXT        NOT NULL DEFAULT 'pending',
  ditinjau_oleh BIGINT      REFERENCES users(id),
  ditinjau_pada TIMESTAMPTZ,
  dibuat_pada   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT status_valid    CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT nominal_positif CHECK (nominal > 0)
);

CREATE INDEX topup_requests_status_idx ON topup_requests (status);
