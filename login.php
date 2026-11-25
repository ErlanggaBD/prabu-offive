<?php
require_once __DIR__.'/lib/auth.php';

session_start_once();

$error = '';

if(($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST'){
    $token = (string)($_POST['csrf'] ?? '');
    if(empty($_SESSION['login_csrf']) || !hash_equals((string)$_SESSION['login_csrf'], $token)){
        $error = 'Sesi login tidak valid. Muat ulang halaman lalu coba lagi.';
    }else{
        $username = trim((string)($_POST['username'] ?? ''));
        $password = (string)($_POST['password'] ?? '');
        $st = db()->prepare('SELECT * FROM '.t('user').' WHERE username = ? AND aktif = 1 LIMIT 1');
        $st->execute([$username]);
        $user = $st->fetch();

        if(!$user || !password_verify($password, $user['password_hash'])){
            $error = 'Username atau password salah.';
        }else{
            make_session($user);
            $up = db()->prepare('UPDATE '.t('user').' SET last_login = ?, updated_at = ? WHERE id = ?');
            $up->execute([now(), now(), $user['id']]);
            audit_log('login', 'user', (string)$user['id'], ['device' => device_label()], (int)$user['id']);
            $next = (string)($_POST['next'] ?? $_GET['next'] ?? '');
            header('Location: '.($next === app_file() ? $next : app_file()));
            exit;
        }
    }
}

if(empty($_SESSION['login_csrf'])){
    $_SESSION['login_csrf'] = random_token();
}

if($error === '' && current_user()){
    header('Location: '.app_url());
    exit;
}

$e = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
?><!doctype html>
<html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Masuk · Prabu Office</title>
<style>
  :root{color-scheme:light dark}
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f3f6fb;color:#1b2430;font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;padding:20px}
  :root[data-theme="dark"] body,body{background:#0f141a;color:#e4e9ef}
  .box{width:min(380px,100%);background:#fff;color:#1b2430;border:1px solid #d5dde6;border-radius:16px;padding:24px;box-shadow:0 10px 30px rgba(20,40,80,.12)}
  :root[data-theme="dark"] .box{background:#18202a;color:#e4e9ef;border-color:#2d3947}
  h1{margin:0 0 4px;font-size:20px;color:#3560d8}
  p{margin:0 0 18px;color:#5f6b7a;font-size:13px}
  label{display:block;margin-top:12px;font-size:12px;color:#5f6b7a}
  input{width:100%;box-sizing:border-box;margin-top:4px;padding:10px 12px;border:1px solid #d5dde6;border-radius:9px;font:inherit;background:#fff;color:#1b2430}
  :root[data-theme="dark"] input{background:#0f141a;color:#e4e9ef;border-color:#2d3947}
  button{width:100%;margin-top:18px;padding:11px;border:0;border-radius:9px;background:#3560d8;color:#fff;font:inherit;font-weight:700;cursor:pointer}
  .err{margin-top:14px;padding:10px;border-radius:9px;background:#fdecea;color:#b3261e;font-size:13px}
  .foot{margin-top:16px;font-size:11px;color:#5f6b7a;text-align:center}
</style></head><body>
<form class="box" method="post" autocomplete="username">
  <h1>Prabu Office</h1>
  <p>Masuk untuk mengelola data dan dokumen.</p>
  <input type="hidden" name="csrf" value="<?= $e($_SESSION['login_csrf']) ?>">
  <input type="hidden" name="next" value="<?= $e(($_GET['next'] ?? '') === app_file() ? $_GET['next'] : '') ?>">
  <label>Username<input name="username" required autofocus autocomplete="username"></label>
  <label>Password<input name="password" type="password" required autocomplete="current-password"></label>
  <button type="submit">Masuk</button>
  <?php if($error !== ''): ?><div class="err"><?= $e($error) ?></div><?php endif; ?>
  <div class="foot">Boleh login dari beberapa perangkat bersamaan.</div>
</form>
</body></html>
