import express from 'express';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
const { Pool } = pg;

// Bisa memakai DATABASE_URL, atau konfigurasi PostgreSQL terpisah.
const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER || 'postgres',
      password: String(process.env.PGPASSWORD ?? ''),
      database: process.env.PGDATABASE || 'wevote'
    };

const pool = new Pool(poolConfig);
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const secret = process.env.JWT_SECRET || 'wevote-development-secret-change-me';
const adminPath = (process.env.ADMIN_PATH || '/wevote-control').startsWith('/') ? (process.env.ADMIN_PATH || '/wevote-control') : `/${process.env.ADMIN_PATH}`;

app.use(express.json({ limit: '8mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

function sign(user) {
  return jwt.sign(
    {
      id: user.id,
      identity: user.identity,
      name: user.full_name,
      role: user.role,
      voterType: user.voter_type
    },
    secret,
    { expiresIn: '7d' }
  );
}

function auth(req, res, next) {
  try {
    const token = req.cookies.wevote_token;
    if (!token) return res.status(401).json({ error: 'Belum login' });
    req.user = jwt.verify(token, secret);
    next();
  } catch {
    return res.status(401).json({ error: 'Sesi tidak valid atau sudah berakhir' });
  }
}

function adminOnly(req, res, next) {
  if (!['admin', 'superadmin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Akses admin ditolak' });
  }
  next();
}

async function dbError(res, error) {
  console.error('[DB ERROR]', error);
  return res.status(500).json({
    error: 'Koneksi/database bermasalah. Periksa file .env dan pastikan PostgreSQL berjalan.',
    detail: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
}

app.get('/api/health', async (req, res) => {
  try {
    await pool.query("ALTER TABLE election_settings ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT ''");
    await pool.query("ALTER TABLE election_settings ADD COLUMN IF NOT EXISTS background_1 TEXT DEFAULT ''");
    await pool.query("ALTER TABLE election_settings ADD COLUMN IF NOT EXISTS background_2 TEXT DEFAULT ''");
    await pool.query("ALTER TABLE election_settings ADD COLUMN IF NOT EXISTS background_3 TEXT DEFAULT ''");
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  } catch (e) {
    dbError(res, e);
  }
});

// ---------------- AUTH PEMILIH ----------------
app.post('/api/login', async (req, res) => {
  try {
    const { identity, password, voterType } = req.body;
    if (!identity || !password || !['siswa', 'pegawai'].includes(voterType)) {
      return res.status(400).json({ error: 'Jenis pemilih, ID, dan password wajib diisi.' });
    }

    const q = await pool.query(
      "SELECT * FROM users WHERE identity=$1 AND role='voter' LIMIT 1",
      [String(identity).trim()]
    );
    const user = q.rows[0];

    if (!user || !(await bcrypt.compare(String(password), user.password_hash))) {
      return res.status(401).json({ error: 'NIS/NIP atau password salah.' });
    }
    if (user.voter_type !== voterType) {
      return res.status(401).json({ error: 'Jenis pemilih tidak sesuai dengan akun.' });
    }

    res.cookie('wevote_token', sign(user), {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      user: {
        id: user.id,
        identity: user.identity,
        name: user.full_name,
        role: user.role,
        voterType: user.voter_type
      }
    });
  } catch (e) {
    dbError(res, e);
  }
});

// ---------------- AUTH ADMIN TERPISAH ----------------
app.post('/api/admin/login', async (req, res) => {
  try {
    const { identity, password } = req.body;
    if (!identity || !password) {
      return res.status(400).json({ error: 'Username dan password wajib diisi.' });
    }

    const q = await pool.query(
      "SELECT * FROM users WHERE identity=$1 AND role IN ('admin','superadmin') LIMIT 1",
      [String(identity).trim()]
    );
    const user = q.rows[0];

    if (!user || !(await bcrypt.compare(String(password), user.password_hash))) {
      return res.status(401).json({ error: 'Username atau password admin salah.' });
    }

    res.cookie('wevote_token', sign(user), {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      user: {
        id: user.id,
        identity: user.identity,
        name: user.full_name,
        role: user.role
      }
    });
  } catch (e) {
    dbError(res, e);
  }
});

app.get('/api/session', (req, res) => {
  try {
    const token = req.cookies.wevote_token;
    if (!token) return res.json({ user: null });
    res.json({ user: jwt.verify(token, secret) });
  } catch {
    res.json({ user: null });
  }
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('wevote_token');
  res.json({ ok: true });
});

// ---------------- DATA PEMILIHAN ----------------
app.get('/api/election', async (req, res) => {
  try {
    const settings = (await pool.query('SELECT * FROM election_settings WHERE id=1')).rows[0];
    const candidates = (await pool.query(
      'SELECT id,name,photo_url,vision,mission,sort_order FROM candidates WHERE active=true ORDER BY sort_order,id'
    )).rows;
    const voteCount = (await pool.query(
      'SELECT COUNT(*)::int AS count FROM votes WHERE election_id=1'
    )).rows[0].count;
    const results = (await pool.query(
      `SELECT c.id,c.name,COUNT(v.id)::int AS votes
       FROM candidates c
       LEFT JOIN votes v ON v.candidate_id=c.id AND v.election_id=1
       WHERE c.active=true
       GROUP BY c.id
       ORDER BY c.sort_order,c.id`
    )).rows;

    res.json({ settings, candidates, voteCount, results });
  } catch (e) {
    dbError(res, e);
  }
});

app.get('/api/my-vote', auth, async (req, res) => {
  try {
    if (req.user.role !== 'voter') return res.json({ voted: false });
    const q = await pool.query(
      'SELECT 1 FROM votes WHERE user_id=$1 AND election_id=1 LIMIT 1',
      [req.user.id]
    );
    res.json({ voted: q.rowCount > 0 });
  } catch (e) {
    dbError(res, e);
  }
});

app.post('/api/vote', auth, async (req, res) => {
  if (req.user.role !== 'voter') {
    return res.status(403).json({ error: 'Hanya pemilih yang dapat memilih.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const settings = (await client.query(
      'SELECT * FROM election_settings WHERE id=1 FOR UPDATE'
    )).rows[0];

    const now = new Date();
    const start = settings.start_at ? new Date(settings.start_at) : null;
    const end = start ? new Date(start.getTime() + settings.duration_minutes * 60000) : null;

    if (!start) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Pemilihan belum dimulai.' });
    }
    if (now < start) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Pemilihan belum dimulai.' });
    }
    if (now >= end) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Pemilihan telah selesai.' });
    }

    const exists = await client.query(
      'SELECT 1 FROM votes WHERE user_id=$1 AND election_id=1 LIMIT 1',
      [req.user.id]
    );
    if (exists.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Anda sudah memilih.' });
    }

    const candidateId = Number(req.body.candidateId);
    const candidate = await client.query(
      'SELECT 1 FROM candidates WHERE id=$1 AND active=true LIMIT 1',
      [candidateId]
    );
    if (!candidate.rowCount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Kandidat tidak valid.' });
    }

    await client.query(
      'INSERT INTO votes(user_id,candidate_id,election_id) VALUES($1,$2,1)',
      [req.user.id, candidateId]
    );
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') return res.status(409).json({ error: 'Anda sudah memilih.' });
    return dbError(res, e);
  } finally {
    client.release();
  }
});

// ---------------- ADMIN ----------------
app.get('/api/admin/users', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id,u.identity,u.full_name,u.role,u.voter_type,
             EXISTS(SELECT 1 FROM votes v WHERE v.user_id=u.id AND v.election_id=1) AS voted
      FROM users u
      WHERE u.role='voter'
      ORDER BY u.id
    `);
    res.json(result.rows);
  } catch (e) {
    dbError(res, e);
  }
});

// Import CSV data pemilih. Password hanya diproses menjadi bcrypt hash dan tidak pernah dikembalikan sebagai plaintext.
app.post('/api/admin/users/import', auth, adminOnly, async (req, res) => {
  const csv = String(req.body?.csv || '').replace(/^\uFEFF/, '');
  if (!csv.trim()) return res.status(400).json({ error: 'File CSV kosong.' });

  function parseCsv(text) {
    const rows=[]; let row=[]; let cell=''; let quoted=false;
    for(let i=0;i<text.length;i++){
      const ch=text[i], next=text[i+1];
      if(quoted){
        if(ch==='"' && next==='"'){ cell+='"'; i++; }
        else if(ch==='"') quoted=false;
        else cell+=ch;
      } else {
        if(ch==='"' && cell==='') quoted=true;
        else if(ch===','){ row.push(cell); cell=''; }
        else if(ch==='\n'){ row.push(cell.replace(/\r$/,'')); rows.push(row); row=[]; cell=''; }
        else cell+=ch;
      }
    }
    if(cell!=='' || row.length){ row.push(cell.replace(/\r$/,'')); rows.push(row); }
    return rows.filter(r=>r.some(x=>String(x).trim()!==''));
  }

  const rows=parseCsv(csv);
  if(rows.length<2) return res.status(400).json({ error: 'CSV harus memiliki header dan minimal satu data pemilih.' });
  const header=rows[0].map(x=>String(x).trim().toLowerCase());
  const required=['identity','password','full_name','voter_type'];
  if(!required.every(h=>header.includes(h))) return res.status(400).json({ error: 'Header CSV harus berisi: identity,password,full_name,voter_type.' });
  const idx=Object.fromEntries(header.map((h,i)=>[h,i]));

  const client=await pool.connect(); let inserted=0,updated=0,skipped=0; const errors=[];
  try{
    await client.query('BEGIN');
    for(let n=1;n<rows.length;n++){
      const r=rows[n];
      const identity=String(r[idx.identity]||'').trim();
      const password=String(r[idx.password]||'');
      const fullName=String(r[idx.full_name]||'').trim();
      const voterType=String(r[idx.voter_type]||'').trim().toLowerCase();
      if(!identity || !fullName || !['siswa','pegawai'].includes(voterType)){ skipped++; errors.push(`Baris ${n+1}: identity/nama/jenis tidak valid.`); continue; }
      if(identity.length>50 || fullName.length>150){ skipped++; errors.push(`Baris ${n+1}: identity atau nama terlalu panjang.`); continue; }

      const existing=await client.query('SELECT id,role FROM users WHERE identity=$1 LIMIT 1',[identity]);
      if(existing.rowCount && existing.rows[0].role!=='voter'){ skipped++; errors.push(`Baris ${n+1}: identity ${identity} milik akun admin dan tidak diubah.`); continue; }
      if(existing.rowCount){
        if(password){
          const hash=await bcrypt.hash(password,10);
          await client.query('UPDATE users SET full_name=$1,voter_type=$2,password_hash=$3 WHERE id=$4',[fullName,voterType,hash,existing.rows[0].id]);
        }else{
          await client.query('UPDATE users SET full_name=$1,voter_type=$2 WHERE id=$3',[fullName,voterType,existing.rows[0].id]);
        }
        updated++;
      }else{
        if(!password){ skipped++; errors.push(`Baris ${n+1}: password wajib untuk pemilih baru.`); continue; }
        const hash=await bcrypt.hash(password,10);
        await client.query(`INSERT INTO users(identity,password_hash,full_name,role,voter_type) VALUES($1,$2,$3,'voter',$4)`,[identity,hash,fullName,voterType]);
        inserted++;
      }
    }
    await client.query('COMMIT');
    res.json({ok:true,inserted,updated,skipped,errors:errors.slice(0,20)});
  }catch(e){ await client.query('ROLLBACK'); dbError(res,e); }
  finally{ client.release(); }
});

app.put('/api/admin/settings', auth, adminOnly, async (req, res) => {
  try {
    const { school_name, election_type, location, start_at, duration_minutes, logo_url } = req.body;
    if (!['osis', 'mpk'].includes(election_type)) {
      return res.status(400).json({ error: 'Jenis pemilihan tidak valid.' });
    }
    await pool.query(
      `UPDATE election_settings
       SET school_name=$1,election_type=$2,location=$3,start_at=$4,duration_minutes=$5,logo_url=$6,updated_at=NOW()
       WHERE id=1`,
      [school_name || 'Nama Sekolah', election_type, location || '', start_at || null, Math.max(0, Number(duration_minutes) || 0), logo_url || '']
    );
    res.json({ ok: true });
  } catch (e) {
    dbError(res, e);
  }
});

app.put('/api/admin/settings/logo', auth, adminOnly, async (req, res) => {
  try {
    const { logo_url } = req.body;
    if (logo_url && !String(logo_url).startsWith('data:image/')) return res.status(400).json({ error: 'Logo harus berupa data gambar yang valid.' });
    if (logo_url && String(logo_url).length > 7_000_000) return res.status(400).json({ error: 'Logo terlalu besar setelah dikompresi.' });
    await pool.query('UPDATE election_settings SET logo_url=$1,updated_at=NOW() WHERE id=1', [logo_url || '']);
    res.json({ ok: true });
  } catch(e) { dbError(res,e); }
});

app.put('/api/admin/settings/backgrounds', auth, adminOnly, async (req, res) => {
  try {
    const { background_1, background_2, background_3 } = req.body;
    const values = [background_1, background_2, background_3];
    for (const value of values) {
      if (value && !String(value).startsWith('data:image/')) {
        return res.status(400).json({ error: 'Background harus berupa data gambar yang valid.' });
      }
      if (value && String(value).length > 2_600_000) {
        return res.status(400).json({ error: 'Salah satu background terlalu besar setelah dikompresi.' });
      }
    }
    await pool.query(
      `UPDATE election_settings
       SET background_1=$1,background_2=$2,background_3=$3,updated_at=NOW()
       WHERE id=1`,
      [background_1 || '', background_2 || '', background_3 || '']
    );
    res.json({ ok: true });
  } catch(e) { dbError(res,e); }
});

app.post('/api/admin/candidates', auth, adminOnly, async (req, res) => {
  try {
    const { name, photo_url, vision, mission } = req.body;
    if (photo_url && !String(photo_url).startsWith('data:image/')) return res.status(400).json({ error: 'Foto harus berupa upload gambar dari komputer atau data gambar yang valid.' });
    if (photo_url && String(photo_url).length > 7_000_000) return res.status(400).json({ error: 'Foto terlalu besar setelah dikompresi.' });
    if (!name?.trim()) return res.status(400).json({ error: 'Nama kandidat wajib diisi.' });
    const max = (await pool.query('SELECT COALESCE(MAX(sort_order),0) AS n FROM candidates')).rows[0].n;
    const result = await pool.query(
      `INSERT INTO candidates(name,photo_url,vision,mission,sort_order)
       VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [name.trim(), photo_url || '', vision || '', mission || '', Number(max) + 1]
    );
    res.json(result.rows[0]);
  } catch (e) {
    dbError(res, e);
  }
});

app.put('/api/admin/candidates/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, photo_url, vision, mission } = req.body;
    if (photo_url && !String(photo_url).startsWith('data:image/')) return res.status(400).json({ error: 'Foto harus berupa upload gambar dari komputer atau data gambar yang valid.' });
    if (photo_url && String(photo_url).length > 7_000_000) return res.status(400).json({ error: 'Foto terlalu besar setelah dikompresi.' });
    const result = await pool.query(
      `UPDATE candidates SET name=$1,photo_url=$2,vision=$3,mission=$4
       WHERE id=$5 RETURNING *`,
      [name?.trim(), photo_url || '', vision || '', mission || '', Number(req.params.id)]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Kandidat tidak ditemukan.' });
    res.json(result.rows[0]);
  } catch (e) {
    dbError(res, e);
  }
});

app.delete('/api/admin/candidates/:id', auth, adminOnly, async (req, res) => {
  try {
    await pool.query('UPDATE candidates SET active=false WHERE id=$1', [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (e) {
    dbError(res, e);
  }
});

app.post('/api/admin/reset', auth, adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM votes WHERE election_id=1');
    await client.query('UPDATE candidates SET active=false');
    await client.query(
      "UPDATE election_settings SET start_at=NULL,duration_minutes=0,location='',updated_at=NOW() WHERE id=1"
    );
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    dbError(res, e);
  } finally {
    client.release();
  }
});

// Halaman admin sengaja terpisah dari popup login pemilih.
app.get(adminPath, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, async () => {
  console.log(`WeVote berjalan di http://localhost:${PORT}`);
  try {
    await pool.query("ALTER TABLE election_settings ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT ''");
    await pool.query("ALTER TABLE election_settings ADD COLUMN IF NOT EXISTS background_1 TEXT DEFAULT ''");
    await pool.query("ALTER TABLE election_settings ADD COLUMN IF NOT EXISTS background_2 TEXT DEFAULT ''");
    await pool.query("ALTER TABLE election_settings ADD COLUMN IF NOT EXISTS background_3 TEXT DEFAULT ''");
    await pool.query('SELECT 1');
    console.log('PostgreSQL: terhubung');
  } catch (e) {
    console.error('\nPostgreSQL belum terhubung. Periksa .env.');
    console.error(e.message);
  }
});
