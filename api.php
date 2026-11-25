<?php
require_once __DIR__.'/lib/db.php';
require_once __DIR__.'/lib/auth.php';
require_once __DIR__.'/lib/audit.php';
require_once __DIR__.'/lib/numbers.php';
require_once __DIR__.'/lib/upload.php';

function send($data, $code = 200){
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo j($data);
    exit;
}

function need_post(){
    if(($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST'){
        send(['ok' => false, 'error' => 'method'], 405);
    }
}

function upsert_row($table, $data){
    $data = array_values($data);
    $cols = array_keys($data[0] ?? []);
    if(!$cols) return 0;
    $quoted = array_map(fn($c) => '`'.$c.'`', $cols);
    $sets   = [];
    foreach($cols as $c){
        if($c === 'id') continue;
        $sets[] = '`'.$c.'` = VALUES(`'.$c.'`)';
    }
    $sql = 'INSERT INTO '.t($table).' ('.implode(',', $quoted).') VALUES ('
         . implode(',', array_fill(0, count($cols), '?')).')'
         . ($sets ? ' ON DUPLICATE KEY UPDATE '.implode(', ', $sets) : '');
    $st = db()->prepare($sql);
    $st->execute(array_values($data[0]));
    return (int)db()->lastInsertId();
}

function get_company(){
    $row = db()->query('SELECT * FROM '.t('company_settings').' WHERE id = 1')->fetch() ?: [];
    $p = jd($row['payload_json'] ?? null, []);
    foreach([
        'name', 'tagline', 'addr1', 'addr2', 'phone', 'phone2', 'email', 'npwp',
        'city', 'signer', 'bank', 'color', 'logo_url'
    ] as $k){
        if(isset($row[$k])) $p[$k] = $row[$k];
    }
    if(isset($row['signer_title'])) $p['signerTitle'] = $row['signer_title'];
    if(isset($row['num_fmt']))      $p['numFmt']      = $row['num_fmt'];
    if(isset($row['fmt_gar']))      $p['fmt_GAR']     = $row['fmt_gar'];
    if(isset($row['fmt_tag']))      $p['fmt_TAG']     = $row['fmt_tag'];
    if(isset($row['pad']))          $p['pad']         = (int)$row['pad'];
    if(isset($row['logo_file_id'])) $p['logoFileId']  = (int)$row['logo_file_id'];
    if(!empty($p['logo_url']))      $p['logo']        = $p['logo_url'];
    unset($p['__seq']);
    return $p;
}

function upsert_company($v){
    $v = is_array($v) ? $v : [];
    $logoId = !empty($v['logoFileId']) ? (int)$v['logoFileId'] : null;
    $payload = $v;
    $payload['logoFileId'] = $logoId;
    upsert_row('company_settings', [[
        'id'           => 1,
        'name'         => $v['name'] ?? null,
        'tagline'      => $v['tagline'] ?? null,
        'addr1'        => $v['addr1'] ?? null,
        'addr2'        => $v['addr2'] ?? null,
        'phone'        => $v['phone'] ?? null,
        'phone2'       => $v['phone2'] ?? null,
        'email'        => $v['email'] ?? null,
        'npwp'         => $v['npwp'] ?? null,
        'city'         => $v['city'] ?? null,
        'signer'       => $v['signer'] ?? null,
        'signer_title' => $v['signerTitle'] ?? null,
        'bank'         => $v['bank'] ?? null,
        'num_fmt'      => $v['numFmt'] ?? null,
        'fmt_gar'      => $v['fmt_GAR'] ?? null,
        'fmt_tag'      => $v['fmt_TAG'] ?? null,
        'pad'          => max(1, min(20, (int)($v['pad'] ?? 3))),
        'color'        => $v['color'] ?? null,
        'logo_url'     => $v['logo'] ?? null,
        'logo_file_id' => $logoId,
        'payload_json' => j($payload),
        'updated_at'   => now(),
    ]]);
}

function get_counters(){
    $out = prabu_default_counters();
    foreach(db()->query('SELECT doc_type, seq FROM '.t('counters')) as $r){
        $out[$r['doc_type']] = (int)$r['seq'];
    }
    return $out;
}

function upsert_counters($value){
    if(!is_array($value)) return;
    $default = prabu_default_counters();
    foreach($value as $k => $seq){
        $k = (string)$k;
        if(!array_key_exists($k, $default)) continue;
        $st = db()->prepare(
            'INSERT INTO '.t('counters').' (doc_type, seq, updated_at) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE seq = GREATEST(seq, VALUES(seq)), updated_at = VALUES(updated_at)'
        );
        $st->execute([$k, max(0, (int)$seq), now()]);
    }
}

function get_office(){
    $row = db()->query('SELECT * FROM '.t('office_settings').' WHERE id = 1')->fetch() ?: [];
    $p = jd($row['payload_json'] ?? null, []);
    foreach(['tpl', 'pphPay', 'pphRep', 'ppnPay', 'ppnRep'] as $k){
        if(isset($row[$k])) $p[$k] = (int)$row[$k];
    }
    if(empty($p['pphPay'])) $p['pphPay'] = 15;
    if(empty($p['waNumber'])) $p['waNumber'] = wa_number();
    return $p;
}

function upsert_office($v){
    $v = is_array($v) ? $v : [];
    $v['pphPay'] = max(1, min(31, (int)($v['pphPay'] ?? 15)));
    $v['pphRep'] = max(1, min(31, (int)($v['pphRep'] ?? 20)));
    $v['ppnPay'] = max(1, min(31, (int)($v['ppnPay'] ?? 31)));
    $v['ppnRep'] = max(1, min(31, (int)($v['ppnRep'] ?? 31)));
    $v['waNumber'] = preg_replace('/\D+/', '', (string)($v['waNumber'] ?? wa_number())) ?: wa_number();
    upsert_row('office_settings', [[
        'id'           => 1,
        'tpl'          => $v['tpl'] ?? null,
        'pphPay'       => $v['pphPay'],
        'pphRep'       => $v['pphRep'],
        'ppnPay'       => $v['ppnPay'],
        'ppnRep'       => $v['ppnRep'],
        'payload_json' => j($v),
        'updated_at'   => now(),
    ]]);
}

function get_tax_done(){
    $sql = 'SELECT td.*, f.original_name AS file_name, pf.original_name AS paid_name
            FROM '.t('tax_done').' td
            LEFT JOIN '.t('files').' f ON f.id = td.file_id
            LEFT JOIN '.t('files').' pf ON pf.id = td.paid_file_id
            ORDER BY td.period_key';
    $out = [];
    foreach(db()->query($sql) as $r){
        $fileId = $r['file_id'] !== null ? (int)$r['file_id'] : null;
        $paidId = $r['paid_file_id'] !== null ? (int)$r['paid_file_id'] : null;
        $out[$r['period_key']] = [
            'done'        => (bool)$r['done'],
            'fileId'      => $fileId,
            'fileUrl'     => $fileId ? 'api.php?r=file.get&id='.$fileId : null,
            'fileName'    => $r['file_name'],
            'paidFileId'  => $paidId,
            'paidFileUrl' => $paidId ? 'api.php?r=file.get&id='.$paidId : null,
            'paidFileName'=> $r['paid_name'],
            'note'        => $r['note'],
        ];
    }
    return $out;
}

function upsert_tax_done($value){
    if(!is_array($value)) return;
    $st = db()->prepare(
        'INSERT INTO '.t('tax_done').' (period_key, done, file_id, paid_file_id, note, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           done = CASE WHEN file_id IS NOT NULL THEN 1 ELSE VALUES(done) END,
           file_id = CASE WHEN VALUES(file_id) IS NULL THEN file_id ELSE VALUES(file_id) END,
           paid_file_id = CASE WHEN VALUES(paid_file_id) IS NULL THEN paid_file_id ELSE VALUES(paid_file_id) END,
           note = CASE WHEN VALUES(note) IS NULL THEN note ELSE VALUES(note) END,
           updated_at = VALUES(updated_at)'
    );
    foreach($value as $k => $v){
        $key = (string)$k;
        if($key === '') continue;
        $arr = is_array($v) ? $v : [];
        $fileId = !empty($arr['fileId']) ? (int)$arr['fileId'] : null;
        $paidId = !empty($arr['paidFileId']) ? (int)$arr['paidFileId'] : null;
        $done = $fileId ? 1 : (is_array($v) ? (!empty($v['done']) ? 1 : 0) : (!empty($v) ? 1 : 0));
        $note = isset($arr['note']) ? substr((string)$arr['note'], 0, 500) : null;
        $st->execute([$key, $done, $fileId, $paidId, $note, now()]);
    }
}

function get_ui(){
    $out = [];
    foreach(db()->query('SELECT k, v FROM '.t('ui_settings')) as $r){
        $out[$r['k']] = $r['v'];
    }
    return $out;
}

function get_history(){
    $out = [];
    $st = db()->query('SELECT payload_json FROM '.t('transactions').' ORDER BY id DESC');
    foreach($st as $r){
        $tx = jd($r['payload_json'], null);
        if(is_array($tx)) $out[] = $tx;
    }
    return $out;
}

function get_invoice_entries(){
    $out = [];
    $st = db()->query('SELECT source, payload_json FROM '.t('invoice_entries').' ORDER BY id ASC');
    foreach($st as $r){
        $row = jd($r['payload_json'], null);
        if(!is_array($row)) continue;
        $row['src'] = !empty($r['source']) ? 1 : (int)($row['src'] ?? 0);
        $out[] = $row;
    }
    return $out;
}

function upsert_invoice_rows($rows){
    if(!is_array($rows)) return;
    $pdo = db();
    $ids = [];
    $pdo->beginTransaction();
    try{
        foreach($rows as $r){
            if(!is_array($r) || empty($r['id'])) continue;
            $id = (int)$r['id'];
            $ids[] = $id;

            $sub = 0;
            foreach(($r['items'] ?? []) as $it){
                $sub += n($it['q'] ?? 0) * n($it['p'] ?? 0);
            }
            $ppnPct = n($r['ppn'] ?? 0);
            $ppnAmt = round($sub * $ppnPct / 100, 2);
            $grand  = round($sub + $ppnAmt, 2);

            upsert_row('invoice_entries', [[
                'id'              => $id,
                'source'          => !empty($r['src']) ? 1 : 0,
                'transaction_id'  => !empty($r['transaction_id']) ? (int)$r['transaction_id'] : null,
                'no'              => $r['no'] ?? null,
                'date'            => iso($r['date'] ?? null),
                'client'          => $r['client'] ?? null,
                'addr'            => $r['addr'] ?? null,
                'pono'            => $r['pono'] ?? null,
                'ppn'             => $ppnPct,
                'nilai_transaksi' => round($sub, 2),
                'ppn_amount'      => $ppnAmt,
                'grand_total'     => $grand,
                'nilai_akhir'     => round($sub, 2),
                'paid'            => !empty($r['paid']) ? 1 : 0,
                'pd'              => iso($r['pd'] ?? null),
                'acct'            => $r['acct'] ?? null,
                'ref'             => $r['ref'] ?? null,
                'cut'             => n($r['cut'] ?? 0),
                'payload_json'    => j($r),
                'updated_at'      => now(),
            ]]);
        }

        if($ids){
            $ph = implode(',', array_fill(0, count($ids), '?'));
            $st = $pdo->prepare('DELETE FROM '.t('invoice_entries').' WHERE id NOT IN ('.$ph.')');
            $st->execute($ids);
        }else{
            $pdo->exec('DELETE FROM '.t('invoice_entries'));
        }
        $pdo->commit();
    }catch(Throwable $e){
        if($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

function upsert_tx($tx, $allocate = true){
    if(!is_array($tx) || empty($tx['id'])) throw new RuntimeException('Transaksi tidak valid.');
    $pdo = db();
    $id  = (int)$tx['id'];

    $st = $pdo->prepare('SELECT id FROM '.t('transactions').' WHERE id = ?');
    $st->execute([$id]);
    $exists = (bool)$st->fetchColumn();

    $counters = null;
    if($allocate && !$exists && !empty($tx['numsAuto'])){
        [$nums, $counters] = prabu_allocate_numbers($tx, get_company());
        $tx['nums'] = $nums;
    }

    $sub = 0;
    $items = is_array($tx['items'] ?? null) ? $tx['items'] : [];
    foreach($items as $it){
        $disc = n($it['disc'] ?? 0);
        $sub += n($it['qty'] ?? 0) * n($it['price'] ?? 0) * (1 - $disc / 100);
    }
    $ppnPct = n($tx['ppn'] ?? 0);
    $ppnAmt = round($sub * $ppnPct / 100, 2);
    $grand  = round($sub + $ppnAmt, 2);
    $dpPct  = n($tx['dpPct'] ?? 0);
    $dpAmt  = round($grand * $dpPct / 100, 2);
    $mode   = $dpPct > 0 ? (string)($tx['billMode'] ?? 'full') : 'full';
    $due    = $mode === 'dp' ? $dpAmt : ($mode === 'lunas' ? round($grand - $dpAmt, 2) : $grand);

    $uid = function_exists('current_user') ? (current_user()['id'] ?? null) : null;

    $createdAt = now();
    if($exists){
        $cs = $pdo->prepare('SELECT created_at FROM '.t('transactions').' WHERE id = ?');
        $cs->execute([$id]);
        $oldCreated = $cs->fetchColumn();
        if($oldCreated) $createdAt = $oldCreated;
    }elseif(!empty($tx['createdAt'])){
        $createdAt = (string)$tx['createdAt'];
    }

    upsert_row('transactions', [[
        'id'            => $id,
        'po_no'         => $tx['poNo'] ?? null,
        'po_date'       => iso($tx['poDate'] ?? null),
        'doc_date'      => iso($tx['docDate'] ?? null),
        'ship_date'     => iso($tx['shipDate'] ?? null),
        'due_date'      => iso($tx['dueDate'] ?? null),
        'tag_date'      => iso($tx['tagDate'] ?? null),
        'client_name'   => $tx['clientName'] ?? null,
        'client_code'   => $tx['clientCode'] ?? null,
        'client_phone'  => $tx['clientPhone'] ?? null,
        'pic_name'      => $tx['picName'] ?? null,
        'pic_title'     => $tx['picTitle'] ?? null,
        'salut'         => $tx['salut'] ?? null,
        'client_addr'   => $tx['clientAddr'] ?? null,
        'ppn'           => $ppnPct,
        'dp_pct'        => $dpPct,
        'bill_mode'     => $mode,
        'subtotal'      => round($sub, 2),
        'ppn_amount'    => $ppnAmt,
        'grand_total'   => $grand,
        'dp_amount'     => $dpAmt,
        'due_amount'    => $due,
        'gar_days'      => !empty($tx['garDays']) ? (int)$tx['garDays'] : null,
        'po_file_id'    => !empty($tx['poFileId']) ? (int)$tx['poFileId'] : null,
        'doc_numbers'   => j($tx['nums'] ?? []),
        'payload_json'  => j($tx),
        'created_by'    => $uid,
        'updated_by'    => $uid,
        'created_at'    => $createdAt,
        'updated_at'    => now(),
    ]]);

    $del = $pdo->prepare('DELETE FROM '.t('transaction_items').' WHERE transaction_id = ?');
    $del->execute([$id]);
    $ins = $pdo->prepare(
        'INSERT INTO '.t('transaction_items').'
         (transaction_id, line_no, descr, sn, qty, unit, price, disc, line_amount, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    foreach($items as $i => $it){
        $disc = n($it['disc'] ?? 0);
        $line = n($it['qty'] ?? 0) * n($it['price'] ?? 0) * (1 - $disc / 100);
        $ins->execute([
            $id, $i, $it['desc'] ?? null, $it['sn'] ?? null,
            n($it['qty'] ?? 0), $it['unit'] ?? null, n($it['price'] ?? 0), $disc,
            round($line, 2), j($it),
        ]);
    }

    if(!empty($tx['poFileId'])){
        $f = $pdo->prepare('UPDATE '.t('files').' SET transaction_id = ? WHERE id = ?');
        $f->execute([$id, (int)$tx['poFileId']]);
    }

    return [$tx, $counters];
}

function pick_val($p, $key, $fallback = null){
    if(is_array($p) && array_key_exists($key, $p)) return $p[$key];
    if(is_array($p) && isset($p['prabu']) && is_array($p['prabu']) && array_key_exists($key, $p['prabu'])) return $p['prabu'][$key];
    $flat = 'prabu.'.$key;
    if(is_array($p) && array_key_exists($flat, $p)) return $p[$flat];
    return $fallback;
}

function bootstrap_data(){
    return [
        'ok'             => true,
        'settings'       => get_company(),
        'officeSettings' => get_office(),
        'counters'       => get_counters(),
        'history'        => get_history(),
        'invoiceEntries' => get_invoice_entries(),
        'taxDone'        => get_tax_done(),
        'ui'             => get_ui(),
    ];
}

$route = $_GET['r'] ?? '';

try{
    switch($route){
        case 'auth.me':
            $u = current_user();
            send([
                'authenticated' => (bool)$u,
                'csrf'          => $u['csrf'] ?? null,
                'user'          => $u ? ['id' => (int)$u['id'], 'username' => $u['username'], 'nama' => $u['nama']] : null,
            ]);
            break;

        case 'auth.logout':
            need_post();
            $u = require_csrf();
            audit_log('logout', 'session', (string)$u['session_id'], [], (int)$u['id']);
            logout_current();
            send(['ok' => true]);
            break;

        case 'bootstrap':
            require_user();
            send(bootstrap_data());
            break;

        case 'state.save':
            need_post();
            $u = require_csrf();
            $b = body_json();
            $scope = (string)($b['scope'] ?? '');
            $value = $b['value'] ?? null;

            switch($scope){
                case 'settings':
                    upsert_company($value);
                    break;
                case 'counters':
                    upsert_counters($value);
                    break;
                case 'po_d':
                    upsert_invoice_rows($value);
                    break;
                case 'po_s':
                    upsert_office($value);
                    break;
                case 'po_t':
                    upsert_tax_done($value);
                    break;
                case 'history':
                    // Transaksi disimpan lewat tx.save agar penomoran tetap atomik.
                    break;
                default:
                    send(['ok' => false, 'error' => 'scope tidak dikenali'], 400);
            }
            audit_log('state.save', $scope, '', ['scope' => $scope], (int)$u['id']);
            send(['ok' => true]);
            break;

        case 'ui.save':
            need_post();
            $u = require_csrf();
            $b = body_json();
            $k = (string)($b['key'] ?? '');
            if($k === '') send(['ok' => false, 'error' => 'key kosong'], 400);
            upsert_row('ui_settings', [[
                'k' => substr($k, 0, 64),
                'v' => isset($b['value']) ? (string)$b['value'] : null,
                'updated_at' => now(),
            ]]);
            send(['ok' => true]);
            break;

        case 'tx.save':
            need_post();
            $u = require_csrf();
            $b = body_json();
            [$tx, $counters] = upsert_tx($b['tx'] ?? null, !empty($b['allocate']));
            audit_log('tx.save', 'transaction', (string)$tx['id'], ['poNo' => $tx['poNo'] ?? null], (int)$u['id']);
            send([
                'ok'       => true,
                'tx'       => $tx,
                'counters' => $counters ?: get_counters(),
            ]);
            break;

        case 'tx.delete':
            need_post();
            $u = require_csrf();
            $b = body_json();
            $id = (int)($b['id'] ?? 0);
            $st = db()->prepare('DELETE FROM '.t('transactions').' WHERE id = ?');
            $st->execute([$id]);
            $st = db()->prepare('DELETE FROM '.t('invoice_entries').' WHERE transaction_id = ?');
            $st->execute([$id]);
            if($id){
                $f = db()->prepare('UPDATE '.t('files').' SET transaction_id = NULL WHERE transaction_id = ?');
                $f->execute([$id]);
            }
            audit_log('tx.delete', 'transaction', (string)$id, [], (int)$u['id']);
            send(['ok' => true]);
            break;

        case 'file.upload':
            need_post();
            require_csrf();
            $kind = (string)($_POST['kind'] ?? 'po');
            $res = upload_file($_FILES['file'] ?? null, $kind, $_POST);
            audit_log('file.upload', $kind, (string)$res['id'], ['path' => $res['path']]);
            send(['ok' => true] + $res);
            break;

        case 'file.get':
            require_user();
            stream_file((int)($_GET['id'] ?? 0));
            break;

        case 'file.delete':
            need_post();
            $u = require_csrf();
            $b = body_json();
            $id = (int)($b['id'] ?? 0);
            $st = db()->prepare('SELECT * FROM '.t('files').' WHERE id = ?');
            $st->execute([$id]);
            $row = $st->fetch();
            if($row){
                $abs = dirname(__DIR__).'/storage/'.$row['rel_path'];
                if(is_file($abs)) @unlink($abs);
                $d = db()->prepare('DELETE FROM '.t('files').' WHERE id = ?');
                $d->execute([$id]);
                if(!empty($row['ref_key']) && in_array($row['kind'], ['spt_masa', 'spt_tahunan'], true)){
                    $c = db()->prepare('UPDATE '.t('tax_done').' SET done = 0, file_id = NULL WHERE period_key = ? AND file_id = ?');
                    $c->execute([$row['ref_key'], $id]);
                }
                audit_log('file.delete', $row['kind'], (string)$id, ['path' => $row['rel_path']], (int)$u['id']);
            }
            send(['ok' => true]);
            break;

        case 'session.list':
            $u = require_user();
            $st = db()->prepare(
                'SELECT id, device_label, ip, created_at, last_seen_at, expires_at
                 FROM '.t('sessions').'
                 WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
                 ORDER BY last_seen_at DESC'
            );
            $st->execute([$u['id'], now()]);
            send(['ok' => true, 'sessions' => $st->fetchAll(), 'current' => (int)$u['session_id']]);
            break;

        case 'session.revoke':
            need_post();
            $u = require_csrf();
            $b = body_json();
            $id = (int)($b['id'] ?? 0);
            $st = db()->prepare('UPDATE '.t('sessions').' SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL');
            $st->execute([now(), $id, $u['id']]);
            audit_log('session.revoke', 'session', (string)$id, [], (int)$u['id']);
            send(['ok' => true]);
            break;

        case 'backup.export':
            require_user();
            $data = bootstrap_data();
            unset($data['ok']);
            $data['exportedAt'] = now();
            send($data);
            break;

        case 'migrate.import':
            need_post();
            $u = require_csrf();
            $b = body_json();
            $p = is_array($b['payload'] ?? null) ? $b['payload'] : $b;

            $settings = pick_val($p, 'settings', null);
            $counters = pick_val($p, 'counters', null);
            $history  = pick_val($p, 'history', null);
            $poD      = $p['po_d'] ?? null;
            $poS      = $p['po_s'] ?? null;
            $poT      = $p['po_t'] ?? null;
            $theme    = pick_val($p, 'theme', null);

            if(is_array($settings)) upsert_company($settings);
            if(is_array($counters)) upsert_counters($counters);
            if(is_array($poS)) upsert_office($poS);
            if(is_array($poT)) upsert_tax_done($poT);
            if(is_array($history)){
                foreach($history as $tx) upsert_tx($tx, false);
            }
            if(is_array($poD)) upsert_invoice_rows($poD);
            if($theme !== null){
                upsert_row('ui_settings', [[
                    'k' => 'prabu.theme',
                    'v' => (string)$theme,
                    'updated_at' => now(),
                ]]);
            }

            audit_log('migrate.import', 'database', '', [
                'settings' => is_array($settings),
                'history'  => is_array($history) ? count($history) : 0,
                'po_d'     => is_array($poD) ? count($poD) : 0,
            ], (int)$u['id']);
            send(['ok' => true] + bootstrap_data());
            break;

        default:
            send(['ok' => false, 'error' => 'route tidak dikenali'], 404);
    }
}catch(Throwable $e){
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo j(['ok' => false, 'error' => $e->getMessage()]);
}
