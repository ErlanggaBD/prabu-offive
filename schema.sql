-- Prabu Office MySQL schema.
-- __PREFIX__ diganti install.php dengan DB_PREFIX dari config.php.

CREATE TABLE IF NOT EXISTS `__PREFIX__user` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(100) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `nama` VARCHAR(150) NOT NULL DEFAULT 'Admin',
  `aktif` TINYINT(1) NOT NULL DEFAULT 1,
  `last_login` DATETIME NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `__PREFIX__sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `token_hash` CHAR(64) NOT NULL,
  `user_id` INT UNSIGNED NOT NULL,
  `device_label` VARCHAR(255) NULL,
  `ip` VARCHAR(45) NULL,
  `csrf` CHAR(64) NOT NULL,
  `created_at` DATETIME NOT NULL,
  `last_seen_at` DATETIME NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `revoked_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_session_token` (`token_hash`),
  KEY `ix_session_user` (`user_id`),
  KEY `ix_session_expire` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `__PREFIX__company_settings` (
  `id` TINYINT UNSIGNED NOT NULL,
  `name` VARCHAR(255) NULL,
  `tagline` VARCHAR(255) NULL,
  `addr1` TEXT NULL,
  `addr2` TEXT NULL,
  `phone` VARCHAR(100) NULL,
  `phone2` VARCHAR(100) NULL,
  `email` VARCHAR(150) NULL,
  `npwp` VARCHAR(50) NULL,
  `city` VARCHAR(100) NULL,
  `signer` VARCHAR(150) NULL,
  `signer_title` VARCHAR(150) NULL,
  `bank` TEXT NULL,
  `num_fmt` VARCHAR(255) NULL,
  `fmt_gar` VARCHAR(255) NULL,
  `fmt_tag` VARCHAR(255) NULL,
  `pad` TINYINT UNSIGNED NOT NULL DEFAULT 3,
  `color` VARCHAR(20) NULL,
  `logo_url` TEXT NULL,
  `logo_file_id` BIGINT UNSIGNED NULL,
  `payload_json` LONGTEXT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `__PREFIX__office_settings` (
  `id` TINYINT UNSIGNED NOT NULL,
  `tpl` TEXT NULL,
  `pphPay` TINYINT UNSIGNED NOT NULL DEFAULT 10,
  `pphRep` TINYINT UNSIGNED NOT NULL DEFAULT 20,
  `ppnPay` TINYINT UNSIGNED NOT NULL DEFAULT 31,
  `ppnRep` TINYINT UNSIGNED NOT NULL DEFAULT 31,
  `payload_json` LONGTEXT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `__PREFIX__ui_settings` (
  `k` VARCHAR(64) NOT NULL,
  `v` TEXT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`k`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `__PREFIX__counters` (
  `doc_type` VARCHAR(10) NOT NULL,
  `seq` INT UNSIGNED NOT NULL DEFAULT 0,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`doc_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `__PREFIX__transactions` (
  `id` BIGINT UNSIGNED NOT NULL,
  `po_no` VARCHAR(255) NULL,
  `po_date` DATE NULL,
  `doc_date` DATE NULL,
  `ship_date` DATE NULL,
  `due_date` DATE NULL,
  `tag_date` DATE NULL,
  `client_name` VARCHAR(255) NULL,
  `client_code` VARCHAR(20) NULL,
  `client_phone` VARCHAR(100) NULL,
  `pic_name` VARCHAR(150) NULL,
  `pic_title` VARCHAR(150) NULL,
  `salut` VARCHAR(10) NULL,
  `client_addr` TEXT NULL,
  `ppn` DECIMAL(6,2) NOT NULL DEFAULT 0,
  `dp_pct` DECIMAL(6,2) NOT NULL DEFAULT 0,
  `bill_mode` VARCHAR(10) NULL,
  `subtotal` DECIMAL(16,2) NOT NULL DEFAULT 0,
  `ppn_amount` DECIMAL(16,2) NOT NULL DEFAULT 0,
  `grand_total` DECIMAL(16,2) NOT NULL DEFAULT 0,
  `dp_amount` DECIMAL(16,2) NOT NULL DEFAULT 0,
  `due_amount` DECIMAL(16,2) NOT NULL DEFAULT 0,
  `gar_days` INT UNSIGNED NULL,
  `po_file_id` BIGINT UNSIGNED NULL,
  `doc_numbers` TEXT NULL,
  `payload_json` LONGTEXT NULL,
  `created_by` INT UNSIGNED NULL,
  `updated_by` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_tx_po` (`po_no`),
  KEY `ix_tx_date` (`doc_date`),
  KEY `ix_tx_client` (`client_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `__PREFIX__transaction_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `transaction_id` BIGINT UNSIGNED NOT NULL,
  `line_no` INT UNSIGNED NOT NULL DEFAULT 0,
  `descr` TEXT NULL,
  `sn` TEXT NULL,
  `qty` DECIMAL(14,3) NOT NULL DEFAULT 0,
  `unit` VARCHAR(30) NULL,
  `price` DECIMAL(16,2) NOT NULL DEFAULT 0,
  `disc` DECIMAL(6,2) NOT NULL DEFAULT 0,
  `line_amount` DECIMAL(16,2) NOT NULL DEFAULT 0,
  `payload_json` TEXT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_item_tx` (`transaction_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `__PREFIX__transaction_documents` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `transaction_id` BIGINT UNSIGNED NOT NULL,
  `doc_type` VARCHAR(10) NOT NULL,
  `doc_no` VARCHAR(255) NULL,
  `file_id` BIGINT UNSIGNED NULL,
  `generated_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tx_doc` (`transaction_id`, `doc_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `__PREFIX__invoice_entries` (
  `id` BIGINT UNSIGNED NOT NULL,
  `source` TINYINT(1) NOT NULL DEFAULT 0,
  `transaction_id` BIGINT UNSIGNED NULL,
  `no` VARCHAR(255) NULL,
  `date` DATE NULL,
  `client` VARCHAR(255) NULL,
  `addr` TEXT NULL,
  `pono` VARCHAR(255) NULL,
  `ppn` DECIMAL(6,2) NOT NULL DEFAULT 0,
  `nilai_transaksi` DECIMAL(16,2) NOT NULL DEFAULT 0,
  `ppn_amount` DECIMAL(16,2) NOT NULL DEFAULT 0,
  `grand_total` DECIMAL(16,2) NOT NULL DEFAULT 0,
  `nilai_akhir` DECIMAL(16,2) NOT NULL DEFAULT 0,
  `paid` TINYINT(1) NOT NULL DEFAULT 0,
  `pd` DATE NULL,
  `acct` VARCHAR(100) NULL,
  `ref` VARCHAR(255) NULL,
  `cut` DECIMAL(6,2) NOT NULL DEFAULT 0,
  `payload_json` LONGTEXT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_ie_source` (`source`),
  KEY `ix_ie_date` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `__PREFIX__tax_done` (
  `period_key` VARCHAR(255) NOT NULL,
  `done` TINYINT(1) NOT NULL DEFAULT 0,
  `file_id` BIGINT UNSIGNED NULL,
  `paid_file_id` BIGINT UNSIGNED NULL,
  `note` TEXT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`period_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `__PREFIX__files` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `kind` ENUM('po','pdf','logo','bukti','spt_masa','spt_tahunan') NOT NULL,
  `transaction_id` BIGINT UNSIGNED NULL,
  `doc_type` VARCHAR(10) NULL,
  `ref_key` VARCHAR(255) NULL,
  `original_name` VARCHAR(255) NULL,
  `stored_name` VARCHAR(255) NOT NULL,
  `rel_path` VARCHAR(500) NOT NULL,
  `mime` VARCHAR(150) NOT NULL,
  `size_bytes` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `sha256` CHAR(64) NOT NULL,
  `uploaded_by` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_file_kind` (`kind`),
  KEY `ix_file_tx` (`transaction_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `__PREFIX__audit_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NULL,
  `action` VARCHAR(100) NOT NULL,
  `entity` VARCHAR(100) NULL,
  `entity_id` VARCHAR(100) NULL,
  `meta` TEXT NULL,
  `ip` VARCHAR(45) NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_audit_date` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
