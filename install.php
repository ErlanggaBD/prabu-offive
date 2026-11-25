<?php
require_once __DIR__.'/lib/auth.php';
require_once __DIR__.'/lib/numbers.php';

session_start_once();
if(empty($_SESSION['install_csrf'])){
    $_SESSION['install_csrf'] = random_token();
}

$error = '';
$done  = false;

if(($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST'){
    $token = (string)($_POST['csrf'] ?? '');
    $username = trim((string)($_POST['username'] ?? ''));
    $password = (string)($_POST['password'] ?? '');
    $nama     = trim((string)($_POST['nama'] ?? ''));
    if($nama === '') $nama = 'Admin';

    if(!hash_equals((string)$_SESSION['install_csrf'], $token)){
        $error = 'Sesi install tidak valid. Muat ulang halaman.';
    }elseif($username === '' || strlen($password) < 8){
        $error = 'Username wajib diisi dan password minimal 8 karakter.';
    }else{
        try{
            $pdo = db();
            $sql = (string)file_get_contents(__DIR__.'/schema.sql');
            $sql = str_replace('__PREFIX__', (string)(prabu_config()['prefix'] ?? 'prabu_'), $sql);
            foreach(preg_split('/;\s*(?:\r?\n|$)/', $sql) as $q){
                if(trim($q) !== '') $pdo->exec($q);
            }

            // Upgrade idempoten untuk database yang sudah terpasang versi lama.
            try{
                $pdo->exec("ALTER TABLE ".t('files')." MODIFY kind ENUM('po','pdf','logo','bukti','spt_masa','spt_tahunan') NOT NULL");
            }catch(Throwable $ex){}
            $addCols = [
                "ALTER TABLE ".t('files')." ADD COLUMN ref_key VARCHAR(255) NULL AFTER doc_type",
                "ALTER TABLE ".t('tax_done')." ADD COLUMN file_id BIGINT UNSIGNED NULL AFTER done",
                "ALTER TABLE ".t('tax_done')." ADD COLUMN paid_file_id BIGINT UNSIGNED NULL AFTER file_id",
                "ALTER TABLE ".t('tax_done')." ADD COLUMN note TEXT NULL AFTER paid_file_id",
            ];
            foreach($addCols as $q){
                try{ $pdo->exec($q); }catch(Throwable $ex){}
            }

            foreach(prabu_default_counters() as $k => $seq){
                $st = $pdo->prepare('INSERT IGNORE INTO '.t('counters').' (doc_type, seq, updated_at) VALUES (?, ?, ?)');
                $st->execute([$k, $seq, now()]);
            }

            $st = $pdo->prepare('SELECT id FROM '.t('user').' WHERE username = ?');
            $st->execute([$username]);
            if($st->fetchColumn()){
                $error = 'Username sudah ada. Pilih username lain.';
            }else{
                $st = $pdo->prepare(
                    'INSERT INTO '.t('user').' (username, password_hash, nama, aktif, created_at, updated_at)
                     VALUES (?, ?, ?, 1, ?, ?)'
                );
                $st->execute([$username, password_hash($password, PASSWORD_DEFAULT), $nama, now(), now()]);
                $done = true;
            }
        }catch(Throwable $e){
            $error = 'Install gagal: '.$e->getMessage();
        }
    }
}

$e = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
?><!doctype html>
<html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Install · Prabu Office</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f3f6fb;color:#1b2430;font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;padding:20px}
  .box{width:min(460px,100%);background:#fff;border:1px solid #d5dde6;border-radius:16px;padding:24px;box-shadow:0 10px 30px rgba(20,40,80,.12)}
  h1{margin:0 0 6px;font-size:20px;color:#3560d8}
  p{margin:0 0 16px;color:#5f6b7a}
  label{display:block;margin-top:12px;font-size:12px;color:#5f6b7a}
  input{width:100%;box-sizing:border-box;margin-top:4px;padding:10px 12px;border:1px solid #d5dde6;border-radius:9px;font:inherit}
  button{width:100%;margin-top:18px;padding:11px;border:0;border-radius:9px;background:#3560d8;color:#fff;font:inherit;font-weight:700;cursor:pointer}
  .err,.ok{margin-top:14px;padding:10px;border-radius:9px;font-size:13px}
  .err{background:#fdecea;color:#b3261e}.ok{background:#e7f6ed;color:#1d7a46}
  code{background:#f3f6fb;padding:1px 5px;border-radius:4px}
</style></head><body>
<div class="box">
  <h1>Install Prabu Office</h1>
  <?php if($done): ?>
    <div class="ok">Tabel berhasil dibuat dan akun dibuat. Sekarang buka <a href="login.php">login.php</a>, lalu <b>hapus install.php dari hosting</b>.</div>
  <?php else: ?>
    <p>Isi <code>config.php</code> dulu dengan kredensial MySQL. File ini bisa dijalankan berulang kali.</p>
    <form method="post">
      <input type="hidden" name="csrf" value="<?= $e($_SESSION['install_csrf']) ?>">
      <label>Username<input name="username" required value="<?= $e($_POST['username'] ?? 'admin') ?>"></label>
      <label>Password<input name="password" type="password" required minlength="8"></label>
      <button type="submit">Buat database dan akun</button>
    </form>
    <?php if($error !== ''): ?><div class="err"><?= $e($error) ?></div><?php endif; ?>
  <?php endif; ?>
</div>
</body></html>
