# Prabu Office · Vercel + TiDB + Blob

Backend PHP sudah diport ke Vercel Functions. HTML aplikasi tidak diubah. `app-source.html` adalah salinan dari `prabu-office (1).html`.

## Arsitektur

- `api/app.js` — gerbang sesi. HTML hanya dikirim kalau cookie sesi valid.
- `api/login.js` — form login, CSRF login, bcrypt, session cookie.
- `api/bridge.js` — 14 route dari `api.php`. URL lama `api.php?r=...` tetap dipetakan lewat `vercel.json`.
- `lib/*` — DB TiDB, auth, audit, penomoran, storage, dan store.
- `lib/storage.js` — upload ke Vercel Blob. `file.get`redirect ke URL Blob.
- `scripts/install.js` — pembuat tabel dan akun. Dijalankan lokal, sekali.

## Siapkan

1. Buat repo GitHub kosong, tanpa README.
2. Buat cluster TiDB Cloud Serverless. Catat host, port `4000`, user, password, database, dan CA certificate.
3. Buat project Vercel, import repo GitHub itu.
4. Di Vercel → Storage → Blob, buat store. Token otomatis masuk environment.
5. Isi environment variables Vercel:

```text
TIDB_HOST, TIDB_PORT, TIDB_USER, TIDB_PASSWORD, TIDB_NAME, TIDB_CA
DB_PREFIX=prabu_
BLOB_READ_WRITE_TOKEN=
ADMIN_USER=admin
ADMIN_PASS=password_baru
TZ=Asia/Jakarta
WA_NUMBER=6282246838645
```

`ADMIN_USER` dan `ADMIN_PASS` hanya dipakai oleh `scripts/install.js`. Setelah akun dibuat, kedua variabel ini boleh dihapus dari Vercel.

## Install database

Salin `.env.example` menjadi `.env.local`, isi nilainya, lalu jalankan:

```bash
npm install
npm run install-db
```

Ulangi aman. Skrip memakai `CREATE TABLE IF NOT EXISTS` dan `INSERT IGNORE`.

## Deploy

```bash
git init
git add .
git commit -m "Port Vercel: TiDB + Blob + Functions"
git remote add origin https://github.com/USER/REPO.git
git push -u origin main
```

Vercel auto deploy tiap push. Untuk uji lokal:

```bash
npm run dev
```

`vercel dev` memakai environment variables dari `.env.local`.

## Perubahan yang disengaja

- File tersimpan di Vercel Blob, bukan `storage/uploads/`. Tombol upload, **Lihat**, dan unduh tetap sama.
- `file.get` mengarahkan browser ke URL Blob. Link bersifat public tapi nama filenya acak.
- `install.php` tidak dipakai. Pakai `npm run install-db`.
- `.htaccess` dan `router.php` tidak dipakai. `vercel.json` menggantikan rewrite dan pengamanan.
- Cookie sesi memakai `Secure`, `HttpOnly`, `SameSite=Lax`. Multi-device dan logout per sesi tetap jalan.
- PDF dan OCR tetap berjalan di browser, jadi tidak terkena batas waktu function.

## Verifikasi

1. Buka `/login.php`, login.
2. Buka aplikasi dari dua perangkat. Logout di satu perangkat; perangkat lain tetap aktif.
3. Upload PO, PDF, logo, bukti bayar, SPT masa, dan SPT tahunan.
4. Buka bukti dari Rekap dan SPT dari menu Pajak.
5. Simpan transaksi, cek penomoran otomatis.
6. Backup JSON lalu pulihkan lagi.
7. Cek draf WA H-3 di menu Pajak.
