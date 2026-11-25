<?php
// Gerbang aplikasi. HTML tidak pernah dilayankan langsung tanpa sesi aktif.
require_once __DIR__.'/lib/auth.php';

if(!current_user()){
    header('Location: login.php?next='.rawurlencode('app.php'));
    exit;
}

$src = __DIR__.'/'.app_source();
if(!is_file($src)){
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'File aplikasi tidak ditemukan.';
    exit;
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');
readfile($src);
