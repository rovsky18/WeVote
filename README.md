# WeVote!

Prototype e-voting sekolah: HTML + CSS + Vanilla JS + Node.js/Express + PostgreSQL.

## Perubahan versi ini
- Login popup **hanya untuk Siswa dan Pegawai**.
- Admin/Superadmin mempunyai halaman login terpisah di `/admin`.
- Error `SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string` diperbaiki dengan konfigurasi PostgreSQL yang selalu mengubah password menjadi string dan validasi koneksi saat server start.
- Sesi login menggunakan HttpOnly cookie JWT sehingga refresh tidak otomatis logout.
- Voting dibatasi 1 suara per pemilih melalui UNIQUE(user_id, election_id) di PostgreSQL.

## 1. Install
```bash
npm install
```

## 2. Buat database
Di PostgreSQL/pgAdmin:
```sql
CREATE DATABASE wevote;
```

Lalu jalankan `schema.sql`.

## 3. Buat `.env`
Salin `.env.example` menjadi `.env`.

**Penting:** ganti `ISI_PASSWORD_POSTGRES` dengan password PostgreSQL milikmu. Contoh jika password PostgreSQL adalah `12345`:
```env
DATABASE_URL=postgresql://postgres:12345@localhost:5432/wevote
```

Jangan menulis password dengan tanda kutip tambahan.

## 4. Isi data demo
```bash
node seed.js
```

Jika sebelumnya pernah menjalankan seed lama, akun dengan identity yang sama tidak akan dibuat ulang. Jika perlu reset database untuk demo, hapus database `wevote`, buat lagi, lalu jalankan schema dan seed.

## 5. Jalankan
```bash
npm start
```

Buka:
- Pemilih: `http://localhost:3000`
- Admin: `http://localhost:3000/admin`

## Akun demo
**Superadmin**
- Username: `admin`
- Password: `admin123`

**Siswa**
- NIS: `20260001`
- Password: `123456`

**Pegawai**
- NIP: `198001010001`
- Password: `123456`

## Jika masih muncul error database
Buka `http://localhost:3000/api/health`.
- Jika `database: connected`, koneksi PostgreSQL sudah benar.
- Jika gagal, cek `.env`, password PostgreSQL, nama database `wevote`, dan pastikan service PostgreSQL sedang berjalan.

## Perubahan v3
- Navigasi publik tidak lagi menampilkan link Admin.
- URL halaman admin dapat diatur melalui `ADMIN_PATH` di `.env`; default contoh: `/wevote-control-9x7k`.
- Bug navigasi/modal yang tertutup karena timer berulang sudah diperbaiki. Timer sekarang hanya aktif di halaman Home dan dibersihkan saat berpindah halaman.
- Foto kandidat dapat dipilih langsung dari PC melalui input file. Browser mengompres foto sebelum disimpan sebagai data gambar di database.
- Tetap menggunakan PostgreSQL, Node.js, Express, HTML, CSS, dan Vanilla JavaScript.

## Update Background Halaman Utama
Panel admin sekarang memiliki menu **Background Utama** untuk mengatur 3 gambar background yang berganti otomatis setiap 10 detik.

- Upload JPG/PNG/WebP dari komputer.
- Gambar dikompres otomatis di browser.
- Background dapat dikembalikan ke bawaan WeVote.
- Database menyimpan `background_1`, `background_2`, dan `background_3` pada tabel `election_settings`.
- `server.js` melakukan migrasi kolom secara otomatis saat aplikasi dijalankan.
- Jika ingin migrasi manual, gunakan `migration-background.sql`.
