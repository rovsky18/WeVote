CREATE TABLE IF NOT EXISTS users (
 id SERIAL PRIMARY KEY,
 identity VARCHAR(50) UNIQUE NOT NULL,
 password_hash TEXT NOT NULL,
 full_name VARCHAR(150) NOT NULL,
 role VARCHAR(20) NOT NULL CHECK (role IN ('voter','admin','superadmin')),
 voter_type VARCHAR(20) CHECK (voter_type IN ('pegawai','siswa')),
 created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS election_settings (
 id INTEGER PRIMARY KEY DEFAULT 1,
 school_name VARCHAR(200) NOT NULL DEFAULT 'Nama Sekolah',
 election_type VARCHAR(30) NOT NULL DEFAULT 'osis' CHECK (election_type IN ('osis','mpk')),
 location VARCHAR(255) DEFAULT '',
 start_at TIMESTAMPTZ,
 duration_minutes INTEGER NOT NULL DEFAULT 60,
 logo_url TEXT DEFAULT '',
 background_1 TEXT DEFAULT '',
 background_2 TEXT DEFAULT '',
 background_3 TEXT DEFAULT '',
 updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS candidates (
 id SERIAL PRIMARY KEY,
 name VARCHAR(150) NOT NULL,
 photo_url TEXT DEFAULT '',
 vision TEXT DEFAULT '',
 mission TEXT DEFAULT '',
 sort_order INTEGER DEFAULT 0,
 active BOOLEAN DEFAULT TRUE,
 created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS votes (
 id SERIAL PRIMARY KEY,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE RESTRICT,
 election_id INTEGER NOT NULL DEFAULT 1 REFERENCES election_settings(id),
 created_at TIMESTAMPTZ DEFAULT NOW(),
 UNIQUE(user_id, election_id)
);
INSERT INTO election_settings(id) VALUES (1) ON CONFLICT (id) DO NOTHING;
