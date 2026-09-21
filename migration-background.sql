-- WeVote! - migrasi background halaman utama
-- Jalankan sekali pada database lama jika ingin manual.
-- server.js versi ini juga menjalankan migrasi otomatis saat aplikasi start.

ALTER TABLE election_settings
  ADD COLUMN IF NOT EXISTS background_1 TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS background_2 TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS background_3 TEXT DEFAULT '';

UPDATE election_settings
SET background_1 = COALESCE(background_1, ''),
    background_2 = COALESCE(background_2, ''),
    background_3 = COALESCE(background_3, '')
WHERE id = 1;
