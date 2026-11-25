<?php
require_once __DIR__.'/db.php';
require_once __DIR__.'/audit.php';

function is_https(){
    return (!empty($_SERVER['HTTPS']) && strtolower($_SERVER['HTTPS']) !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

function session_start_once(){
    if(session_status() === PHP_SESSION_NONE){
        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => '/',
            'httponly' => true,
            'secure'   => is_https(),
            'samesite' => 'Lax',
        ]);
        session_start();
    }
}

function app_file(){
    $c = prabu_config();
    return $c['app_file'] ?? 'prabu-office (1).html';
}

function app_source(){
    $c = prabu_config();
    return $c['app_source'] ?? 'prabu-office (1).html';
}

function wa_number(){
    $c = prabu_config();
    return (string)($c['wa_number'] ?? '6282246838645');
}

function app_url(){
    return rawurlencode(app_file());
}

function client_ip(){
    foreach(['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR'] as $k){
        if(!empty($_SERVER[$k])){
            $parts = explode(',', $_SERVER[$k]);
            return trim($parts[0]);
        }
    }
    return null;
}

function device_label(){
    $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? 'Perangkat');
    return substr($ua, 0, 255);
}

function current_user(){
    session_start_once();
    $cookie = $_COOKIE['prabu_sess'] ?? '';
    if($cookie === '') return null;

    $hash = hash('sha256', $cookie);
    $st = db()->prepare(
        'SELECT s.id AS session_id, s.csrf, s.device_label, s.ip, s.expires_at,
                u.id, u.username, u.nama, u.aktif
         FROM '.t('sessions').' s
         JOIN '.t('user').' u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.aktif = 1
         LIMIT 1'
    );
    $st->execute([$hash, now()]);
    $u = $st->fetch();
    if(!$u) return null;

    // Update last_seen paling sering tiap 60 detik supaya tidak menulis tiap request.
    $st2 = db()->prepare('UPDATE '.t('sessions').' SET last_seen_at = ? WHERE id = ? AND last_seen_at < ?');
    $st2->execute([now(), $u['session_id'], date('Y-m-d H:i:s', time() - 60)]);

    return $u;
}

function require_user(){
    $u = current_user();
    if(!$u){
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo j(['ok' => false, 'error' => 'login', 'login_url' => 'login.php']);
        exit;
    }
    return $u;
}

function require_csrf(){
    $u = current_user();
    if(!$u){
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo j(['ok' => false, 'error' => 'login']);
        exit;
    }
    $given = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if($given === '') $given = $_POST['csrf'] ?? '';
    if($given === '') $given = body_json()['csrf'] ?? '';

    if(!is_string($given) || !hash_equals((string)$u['csrf'], $given)){
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        echo j(['ok' => false, 'error' => 'csrf']);
        exit;
    }
    return $u;
}

function make_session($user){
    $token = random_token();
    $csrf  = random_token();
    $ttl   = 30 * 86400;
    $exp   = date('Y-m-d H:i:s', time() + $ttl);

    $st = db()->prepare(
        'INSERT INTO '.t('sessions').'
         (token_hash, user_id, device_label, ip, csrf, created_at, last_seen_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $st->execute([
        hash('sha256', $token),
        $user['id'],
        device_label(),
        client_ip(),
        $csrf,
        now(),
        now(),
        $exp,
    ]);

    setcookie('prabu_sess', $token, [
        'expires'  => time() + $ttl,
        'path'     => '/',
        'httponly' => true,
        'secure'   => is_https(),
        'samesite' => 'Lax',
    ]);

    return ['token' => $token, 'csrf' => $csrf, 'expires' => $exp];
}

function logout_current(){
    session_start_once();
    $cookie = $_COOKIE['prabu_sess'] ?? '';
    if($cookie !== ''){
        $st = db()->prepare('UPDATE '.t('sessions').' SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL');
        $st->execute([now(), hash('sha256', $cookie)]);
    }
    setcookie('prabu_sess', '', [
        'expires'  => time() - 3600,
        'path'     => '/',
        'httponly' => true,
        'secure'   => is_https(),
        'samesite' => 'Lax',
    ]);
}
