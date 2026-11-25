<?php

function prabu_config(){
    static $c = null;
    if($c === null){
        $f = __DIR__.'/../config.php';
        if(!is_file($f)) throw new RuntimeException('config.php belum ada. Salin config.example.php menjadi config.php.');
        $c = require $f;
        if(!is_array($c)) throw new RuntimeException('Format config.php salah.');
    }
    return $c;
}

function db(){
    static $pdo = null;
    if($pdo) return $pdo;

    $c = prabu_config();
    if(empty($c['name']) || $c['name'] === 'nama_database'){
        throw new RuntimeException('Edit config.php dulu: isi host, name, user, dan pass database.');
    }

    $dsn = 'mysql:host='.$c['host'].';dbname='.$c['name'].';charset='.($c['charset'] ?? 'utf8mb4');
    $pdo = new PDO($dsn, $c['user'], (string)($c['pass'] ?? ''), [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
    return $pdo;
}

function t($name){
    return '`'.(prabu_config()['prefix'] ?? 'prabu_').preg_replace('/[^a-z0-9_]/i', '', $name).'`';
}

function now(){
    return date('Y-m-d H:i:s');
}

function j($value){
    return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function jd($value, $default = []){
    if($value === null || $value === '') return $default;
    $x = json_decode((string)$value, true);
    return is_array($x) ? $x : $default;
}

function n($value, $default = 0){
    $v = str_replace(',', '.', (string)$value);
    return is_numeric($v) ? (float)$v : $default;
}

function iso($value){
    $v = trim((string)$value);
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) ? $v : null;
}

function body_json(){
    static $body = null;
    if($body === null){
        $raw = file_get_contents('php://input');
        $d = json_decode((string)$raw, true);
        $body = is_array($d) ? $d : [];
    }
    return $body;
}

function random_token(){
    return bin2hex(random_bytes(32));
}
