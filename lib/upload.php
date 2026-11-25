<?php
require_once __DIR__.'/db.php';
require_once __DIR__.'/audit.php';

function prabu_upload_max($kind){
    if($kind === 'logo') return 3 * 1024 * 1024;
    if(in_array($kind, ['bukti', 'spt_masa', 'spt_tahunan'], true)) return 15 * 1024 * 1024;
    return 25 * 1024 * 1024;
}

function prabu_upload_mimes($kind){
    if($kind === 'logo') return ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];
    if($kind === 'pdf' || $kind === 'spt_masa' || $kind === 'spt_tahunan') return ['application/pdf' => 'pdf'];
    if($kind === 'bukti') return [
        'application/pdf' => 'pdf',
        'image/jpeg'      => 'jpg',
        'image/png'       => 'png',
        'image/webp'      => 'webp',
    ];
    return [
        'application/pdf' => 'pdf',
        'image/jpeg'      => 'jpg',
        'image/png'       => 'png',
        'image/webp'      => 'webp',
        'image/gif'       => 'gif',
        'image/heic'      => 'heic',
        'image/heif'      => 'heif',
    ];
}

function upload_file($file, $kind, $meta = []){
    $kind = in_array($kind, ['po', 'pdf', 'logo', 'bukti', 'spt_masa', 'spt_tahunan'], true) ? $kind : 'po';
    if(!is_array($file) || empty($file['tmp_name']) || !is_uploaded_file($file['tmp_name'])){
        throw new RuntimeException('Tidak ada file yang terunggah.');
    }
    if(($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK){
        throw new RuntimeException('Upload gagal. Kode error: '.($file['error'] ?? '?'));
    }
    if(($file['size'] ?? 0) > prabu_upload_max($kind)){
        throw new RuntimeException('Ukuran file terlalu besar.');
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime  = (string)$finfo->file($file['tmp_name']);
    $allow = prabu_upload_mimes($kind);
    if(!isset($allow[$mime])){
        throw new RuntimeException('Jenis file tidak diizinkan: '.$mime);
    }
    if($mime === 'application/pdf'){
        $head = (string)file_get_contents($file['tmp_name'], false, null, 0, 5);
        if(strpos($head, '%PDF') !== 0){
            throw new RuntimeException('File PDF tidak valid.');
        }
    }

    $ext    = $allow[$mime];
    $dirRel = 'uploads/'.$kind.'/'.date('Ym');
    $absDir = dirname(__DIR__).'/storage/'.$dirRel;
    if(!is_dir($absDir) && !mkdir($absDir, 0755, true)){
        throw new RuntimeException('Gagal membuat folder upload.');
    }

    $stored = bin2hex(random_bytes(16)).'.'.$ext;
    $rel    = $dirRel.'/'.$stored;
    $abs    = $absDir.'/'.$stored;
    if(!move_uploaded_file($file['tmp_name'], $abs)){
        throw new RuntimeException('Gagal menyimpan file di server.');
    }
    @chmod($abs, 0644);

    $original = substr((string)($file['name'] ?? 'file'), 0, 255);
    $hash     = hash_file('sha256', $abs);
    $uid      = function_exists('current_user') ? (current_user()['id'] ?? null) : null;
    $txId     = !empty($meta['transactionId']) ? (int)$meta['transactionId'] : null;
    $docType  = !empty($meta['docType']) ? substr((string)$meta['docType'], 0, 10) : null;
    $refKey   = !empty($meta['refKey']) ? substr((string)$meta['refKey'], 0, 255) : null;

    $st = db()->prepare(
        'INSERT INTO '.t('files').'
         (kind, transaction_id, doc_type, ref_key, original_name, stored_name, rel_path, mime, size_bytes, sha256, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $st->execute([
        $kind, $txId, $docType, $refKey, $original, $stored, $rel, $mime,
        (int)filesize($abs), $hash, $uid, now(),
    ]);
    $id = (int)db()->lastInsertId();

    if($txId && $kind === 'po'){
        $u = db()->prepare('UPDATE '.t('transactions').' SET po_file_id = ? WHERE id = ?');
        $u->execute([$id, $txId]);
    }
    if($txId && $kind === 'pdf'){
        $u = db()->prepare(
            'INSERT INTO '.t('transaction_documents').' (transaction_id, doc_type, doc_no, file_id, generated_at)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE file_id = VALUES(file_id), generated_at = VALUES(generated_at)'
        );
        $u->execute([$txId, $docType ?: 'ALL', $meta['docNo'] ?? null, $id, now()]);
    }
    if($refKey && ($kind === 'spt_masa' || $kind === 'spt_tahunan')){
        $note = trim((string)($meta['label'] ?? '').' '.($meta['period'] ?? ''));
        $u = db()->prepare(
            'INSERT INTO '.t('tax_done').' (period_key, done, file_id, note, updated_at)
             VALUES (?, 1, ?, ?, ?)
             ON DUPLICATE KEY UPDATE done = 1, file_id = VALUES(file_id), note = VALUES(note), updated_at = VALUES(updated_at)'
        );
        $u->execute([$refKey, $id, $note !== '' ? $note : null, now()]);
    }

    return [
        'id'           => $id,
        'kind'         => $kind,
        'url'          => 'api.php?r=file.get&id='.$id,
        'path'         => 'storage/'.$rel,
        'originalName' => $original,
        'mime'         => $mime,
        'size'         => (int)filesize($abs),
        'sha256'       => $hash,
    ];
}

function stream_file($id){
    $st = db()->prepare('SELECT * FROM '.t('files').' WHERE id = ?');
    $st->execute([(int)$id]);
    $row = $st->fetch();
    if(!$row){
        http_response_code(404);
        header('Content-Type: application/json; charset=utf-8');
        echo j(['ok' => false, 'error' => 'File tidak ditemukan.']);
        exit;
    }

    $abs = dirname(__DIR__).'/storage/'.$row['rel_path'];
    if(!is_file($abs)){
        http_response_code(404);
        header('Content-Type: application/json; charset=utf-8');
        echo j(['ok' => false, 'error' => 'File di server tidak ditemukan.']);
        exit;
    }

    header('Content-Type: '.$row['mime']);
    header('Content-Length: '.$row['size_bytes']);
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, max-age=3600');
    $disposition = ($row['kind'] === 'logo') ? 'inline' : 'attachment';
    header('Content-Disposition: '.$disposition.'; filename="'.rawurlencode($row['original_name']).'"');
    readfile($abs);
    exit;
}
