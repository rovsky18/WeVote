import pg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST || 'localhost',
        port: Number(process.env.PGPORT || 5432),
        user: process.env.PGUSER || 'postgres',
        password: String(process.env.PGPASSWORD ?? ''),
        database: process.env.PGDATABASE || 'wevote'
      }
);

try {
  const adminHash = await bcrypt.hash('admin123', 10);
  const voterHash = await bcrypt.hash('123456', 10);

  await pool.query(`
    INSERT INTO users(identity,password_hash,full_name,role,voter_type)
    VALUES
      ('admin',$1,'Superadmin WeVote','superadmin',NULL),
      ('198001010001',$2,'Guru Demo','voter','pegawai'),
      ('20260001',$2,'Siswa Demo','voter','siswa')
    ON CONFLICT(identity) DO UPDATE SET
      password_hash=EXCLUDED.password_hash,
      full_name=EXCLUDED.full_name,
      role=EXCLUDED.role,
      voter_type=EXCLUDED.voter_type
  `, [adminHash, voterHash]);

  await pool.query(`
    INSERT INTO election_settings(id,school_name,election_type,location,start_at,duration_minutes,background_1,background_2,background_3)
    VALUES(1,'SMA/SMK Contoh','osis','Aula Sekolah',NOW()+INTERVAL '5 minutes',60,'','','')
    ON CONFLICT(id) DO NOTHING
  `);

  await pool.query(`
    INSERT INTO candidates(name,photo_url,vision,mission,sort_order)
    SELECT * FROM (VALUES
      ('Kandidat 1','https://placehold.co/500x500?text=Kandidat+1','Mewujudkan sekolah yang aktif, berprestasi, dan berkarakter.','Program literasi, prestasi, kegiatan siswa inklusif, dan lingkungan sekolah tertib.',1),
      ('Kandidat 2','https://placehold.co/500x500?text=Kandidat+2','Membangun budaya sekolah yang kreatif dan kolaboratif.','Forum aspirasi, event kreatif, dan penguatan kegiatan sosial.',2)
    ) AS v(name,photo_url,vision,mission,sort_order)
    WHERE NOT EXISTS (SELECT 1 FROM candidates)
  `);

  console.log('Seed selesai.');
} catch (e) {
  console.error('Seed gagal:', e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
