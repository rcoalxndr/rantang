CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  nama          TEXT        NOT NULL,
  telepon       TEXT        NOT NULL DEFAULT '',
  alamat        TEXT        NOT NULL DEFAULT '',
  peran         TEXT        NOT NULL DEFAULT 'customer',
  saldo         BIGINT      NOT NULL DEFAULT 0,
  dibuat_pada   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT peran_valid       CHECK (peran IN ('customer', 'kitchen')),
  CONSTRAINT saldo_tidak_minus CHECK (saldo >= 0)
);

CREATE TABLE sessions (
  id          TEXT        PRIMARY KEY,
  user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
  kedaluwarsa TIMESTAMPTZ NOT NULL
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
