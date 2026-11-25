<?php
require_once __DIR__.'/db.php';

function prabu_docs(){
    return ['SPH', 'INV', 'KWT', 'SJ', 'BAST', 'GAR', 'TAG'];
}

function prabu_default_counters(){
    return ['SPH' => 17, 'INV' => 1, 'KWT' => 1, 'SJ' => 1, 'BAST' => 1, 'GAR' => 11, 'TAG' => 22];
}

function prabu_doc_number($k, $tx, $company){
    $raw = ($k === 'TAG' && !empty($tx['tagDate']))
        ? $tx['tagDate']
        : (!empty($tx['docDate']) ? $tx['docDate'] : date('Y-m-d'));

    $d = DateTimeImmutable::createFromFormat('!Y-m-d', (string)$raw);
    if(!$d) $d = new DateTimeImmutable('today');

    $fmtKey = 'fmt_'.$k;
    $fmt = (string)($company[$fmtKey] ?? ($company['numFmt'] ?? '{no}/{kode}/PTI-{klien}/{bulan}/{tahun}'));
    $roman = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
    $pad   = max(1, min(10, (int)($company['pad'] ?? 1)));
    $seq   = (int)($company['__seq'] ?? 0);

    $tokens = [
        '{tahun4}' => $d->format('Y'),
        '{tahun}'  => $d->format('y'),
        '{bulan}'  => $roman[(int)$d->format('m') - 1],
        '{kode}'   => $k,
        '{klien}'  => (string)($tx['clientCode'] ?? ''),
        '{no}'     => str_pad((string)$seq, $pad, '0', STR_PAD_LEFT),
    ];

    return strtr($fmt, $tokens);
}

function prabu_allocate_numbers($tx, $company){
    $pdo = db();
    $defaults = prabu_default_counters();
    $nums = [];
    $counters = [];

    $pdo->beginTransaction();
    try{
        foreach(prabu_docs() as $k){
            $ins = $pdo->prepare('INSERT IGNORE INTO '.t('counters').' (doc_type, seq, updated_at) VALUES (?, ?, ?)');
            $ins->execute([$k, $defaults[$k], now()]);

            $sel = $pdo->prepare('SELECT seq FROM '.t('counters').' WHERE doc_type = ? FOR UPDATE');
            $sel->execute([$k]);
            $seq = (int)$sel->fetchColumn() + 1;

            $upd = $pdo->prepare('UPDATE '.t('counters').' SET seq = ?, updated_at = ? WHERE doc_type = ?');
            $upd->execute([$seq, now(), $k]);

            $company['__seq'] = $seq;
            $nums[$k] = prabu_doc_number($k, $tx, $company);
            $counters[$k] = $seq;
        }
        $pdo->commit();
    }catch(Throwable $e){
        if($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    return [$nums, $counters];
}
