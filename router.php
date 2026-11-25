<?php
// Router untuk "php -S". Di Apache/cPanel, aturan ada di .htaccess.
$path = rawurldecode((string)parse_url(($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH));
$base = basename($path);

if(in_array($base, ['config.php', 'config.example.php', 'schema.sql', 'router.php'], true)
   || strpos($path, '/storage/') === 0){
    http_response_code(404);
    exit;
}

if($path === '/' || $path === '/index.php' || $path === '/prabu-office (1).html'){
    require __DIR__.'/app.php';
    return true;
}

return false;
