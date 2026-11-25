# Prabu Office · MySQL + File Hosting

## Langkah pasang

1. Upload semua file folder ini ke hosting.
2. Buat database MySQL dan user database di cPanel.
3. Salin `config.example.php` menjadi `config.php`, lalu isi:
   - `host`, `name`, `user`, `pass`
   - `prefix` boleh dibiarkan `prabu_`
   - `app_file` diisi `app.php`
   - `app_source` diisi `prabu-office (1).html`
   - `wa_number` diisi nomor WA tujuan, misalnya `6282246838645`
4. Buka `https://domain/install.php`, buat username dan password.
5. Hapus `install.php` dari hosting setelah selesai.
6. Buka `login.php`, lalu gunakan aplikasi seperti biasa.

## Penyimpanan

- MySQL: seluruh data transaksi, item, numerik, pengaturan, counter, rekap, pajak, metadata file, audit.
- File Manager hosting: `storage/uploads/po/`, `storage/uploads/pdf/`, `storage/uploads/logo/`, `storage/uploads/bukti/`, `storage/uploads/spt_masa/`, `storage/uploads/spt_tahunan/`.
- Database hanya menyimpan path file, bukan isi file.

## Pembayaran dan pajak

- Menu Bayar pada Rekap menerima lampiran bukti pembayaran berupa PDF atau gambar. Bukti tampil di kolom Bukti dan di rekap bulanan.
- Reminder pajak aktif mulai H-7 sampai tanggal jatuh tempo, termasuk saat sudah lewat.
- SPT Masa PPN jatuh tempo pada akhir bulan berikutnya. SPT Masa PPh jatuh tempo tanggal 20 bulan berikutnya. Setoran PPh tanggal 15 bulan berikutnya.
- SPT Tahunan Orang Pribadi jatuh tempo 31 Maret. SPT Tahunan Badan jatuh tempo 30 April.
- Jika jatuh tempo jatuh pada Sabtu, Minggu, atau tanggal libur yang didaftarkan di Pengaturan, sistem memakai hari kerja berikutnya.
- Reminder hanya nonaktif setelah PDF SPT diunggah pada baris kewajiban terkait di menu Pajak. PDF SPT masa tampil sebagai bukti di rekap bulanan.
- Tanggal default dapat diubah di menu Setelan. Tetap cek pengumuman resmi DJP untuk perubahan aturan dan hari libur.
- Pada H-3 sampai hari jatuh tempo, kolom **WA H-3** di menu Pajak dan kartu Dashboard menampilkan tautan **Buka WA**. Tautan membuka `wa.me` dengan nomor admin dan draf teks sudah terisi. Pesan tidak terkirim otomatis; tinggal pilih kontak lalu kirim di WhatsApp.
- Nomor WA diubah di `config.php` (`wa_number`) atau di menu Setelan. Format boleh `082246838645` atau `6282246838645`.

## Sesi login

- HTML tidak pernah dilayankan langsung. `app.php` memeriksa sesi di server sebelum mengirim halaman. Akses langsung ke `prabu-office (1).html` dialihkan ke `login.php`.
- Cookie sesi berisi token acak, disimpan sebagai hash di MySQL, `HttpOnly`, dan `SameSite=Lax`. Token tidak bisa ditebak atau dipakai ulang setelah logout.
- Setiap perangkat punya token dan CSRF sendiri. Klik **Keluar** di header untuk mencabut sesi perangkat itu saja. Perangkat lain tetap login.
- Menu **Setelan → Sesi login** menampilkan semua perangkat aktif. Sesi lain bisa dicabut dari sana.
- Token kedaluwarsa setelah 30 hari. Halaman memeriksa ulang sesi saat dibuka dari cache browser.
- Di Apache, aturan ada di `.htaccess`. Di server development, jalankan `php -S 0.0.0.0:8765 -t . router.php`.

## Upgrade dari versi sebelumnya

Jika database sudah dibuat dengan `schema.sql` lama, jalankan `install.php` sekali lagi sebelum menghapusnya. Skrip ini menambah kolom `ref_key` pada tabel file serta `file_id`, `paid_file_id`, dan `note` pada tabel pajak tanpa menghapus data lama.

## Multi-device

Satu akun. Boleh login dari beberapa perangkat bersamaan. Tiap perangkat punya sesi dan CSRF sendiri. Logout di satu perangkat tidak mengeluarkan perangkat lain.

## Migrasi data lama

Buka Pengaturan → Pulihkan backup di aplikasi. Pilih backup JSON lama. Data juga akan dikirim ke MySQL lewat `migrate.import`.

`localStorage` tetap dipakai sebagai cache lokal. Saat online, MySQL jadi sumber utama saat halaman dimuat.
