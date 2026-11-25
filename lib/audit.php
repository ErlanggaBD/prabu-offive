<?php
require_once __DIR__.'/db.php';

function audit_log($action, $entity = '', $entityId = '', $meta = [], $userId = null){
    try{
        $uid = $userId;
        if($uid === null && function_exists('current_user')){
            $u = current_user();
            $uid = $u['id'] ?? null;
        }
        $st = db()->prepare(
            'INSERT INTO '.t('audit_logs').' (user_id, action, entity, entity_id, meta, ip, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $st->execute([
            $uid,
            substr((string)$action, 0, 100),
            substr((string)$entity, 0, 100),
            substr((string)$entityId, 0, 100),
            is_array($meta) ? j($meta) : (string)$meta,
            function_exists('client_ip') ? client_ip() : null,
            now(),
        ]);
    }catch(Throwable $e){
        // Audit gagal tidak boleh menggagalkan aksi utama.
    }
}
