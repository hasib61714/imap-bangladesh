-- ═══════════════════════════════════════════════════════════
--  IMAP Bangladesh — Full schema SNAPSHOT (convenience only)
--
--  SOURCE OF TRUTH = database/migrations/*.sql, applied by `npm run migrate`
--  (also run automatically at server startup). This file is a flat snapshot
--  for quick local/docker bootstrap and must be kept in sync with migrations.
--  Requires MariaDB/TiDB (uses ADD COLUMN IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════

CREATE DATABASE IF NOT EXISTS imap_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE imap_db;

-- ── USERS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(36) PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(180) UNIQUE,
  phone         VARCHAR(20)  UNIQUE,
  password_hash VARCHAR(255),
  role          ENUM('customer','provider','admin') DEFAULT 'customer',
  avatar        LONGTEXT,          -- base64 or URL
  login_method  VARCHAR(20) DEFAULT 'email',
  social_id     VARCHAR(120),
  kyc_status    ENUM('not_submitted','pending','verified','rejected') DEFAULT 'not_submitted',
  verified      TINYINT(1) DEFAULT 0,
  balance       DECIMAL(12,2) DEFAULT 500.00,
  points        INT DEFAULT 0,
  referral_code VARCHAR(12) UNIQUE,
  referred_by   VARCHAR(36),
  is_active     TINYINT(1) DEFAULT 1,
  settings      JSON NULL,
  joined_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_role (role),
  INDEX idx_phone (phone),
  INDEX idx_email (email)
) ENGINE=InnoDB;

-- ── SERVICE CATEGORIES ───────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  slug        VARCHAR(60) UNIQUE NOT NULL,
  name_bn     VARCHAR(100) NOT NULL,
  name_en     VARCHAR(100) NOT NULL,
  icon        VARCHAR(10)  DEFAULT '🔧',
  color       VARCHAR(20)  DEFAULT '#1DBF73',
  base_price  DECIMAL(10,2) DEFAULT 300.00,
  is_active   TINYINT(1) DEFAULT 1,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ── PROVIDERS (extends users) ────────────────────────────
CREATE TABLE IF NOT EXISTS providers (
  id              VARCHAR(36) PRIMARY KEY,
  user_id         VARCHAR(36) NOT NULL,
  service_type_bn VARCHAR(120),
  service_type_en VARCHAR(120),
  category_id     INT,
  area_bn         VARCHAR(120),
  area_en         VARCHAR(120),
  bio_bn          TEXT,
  bio_en          TEXT,
  hourly_rate     DECIMAL(10,2) DEFAULT 600.00,
  is_available    TINYINT(1) DEFAULT 1,
  is_verified     TINYINT(1) DEFAULT 0,
  rating          DECIMAL(3,2) DEFAULT 0.00,
  total_jobs      INT DEFAULT 0,
  trust_score     INT DEFAULT 50,
  experience_yrs  INT DEFAULT 0,
  nid_verified    TINYINT(1) DEFAULT 0,
  latitude        DECIMAL(10,8),
  longitude       DECIMAL(11,8),
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  INDEX idx_category (category_id),
  INDEX idx_available (is_available),
  INDEX idx_rating (rating)
) ENGINE=InnoDB;

-- ── PROVIDER SCHEDULE ────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_schedule (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  provider_id  VARCHAR(36) NOT NULL,
  day_name_bn  VARCHAR(30) NOT NULL,
  day_name_en  VARCHAR(20) NOT NULL,
  slot_time    VARCHAR(30) NOT NULL,
  is_available TINYINT(1) DEFAULT 1,
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
  INDEX idx_provider (provider_id)
) ENGINE=InnoDB;

-- ── BOOKINGS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id              VARCHAR(36) PRIMARY KEY,
  customer_id     VARCHAR(36) NOT NULL,
  provider_id     VARCHAR(36) NOT NULL,
  category_id     INT,
  service_name_bn VARCHAR(120),
  service_name_en VARCHAR(120),
  address         TEXT,
  scheduled_time  VARCHAR(60),
  amount          DECIMAL(10,2) NOT NULL,
  platform_fee    DECIMAL(10,2) DEFAULT 0.00,
  payment_method  VARCHAR(30) DEFAULT 'bKash',
  payment_status  ENUM('pending','paid','refunded') DEFAULT 'pending',
  status          ENUM('pending','confirmed','active','completed','cancelled') DEFAULT 'pending',
  is_urgent       TINYINT(1) DEFAULT 0,
  otp_code        VARCHAR(6),
  note            TEXT,
  rated           TINYINT(1) DEFAULT 0,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES users(id),
  FOREIGN KEY (provider_id) REFERENCES providers(id),
  INDEX idx_customer (customer_id),
  INDEX idx_provider (provider_id),
  INDEX idx_status (status)
) ENGINE=InnoDB;

-- ── REVIEWS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  booking_id  VARCHAR(36) NOT NULL,
  customer_id VARCHAR(36) NOT NULL,
  provider_id VARCHAR(36) NOT NULL,
  rating      TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  tags        VARCHAR(255),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id)  REFERENCES bookings(id),
  FOREIGN KEY (customer_id) REFERENCES users(id),
  FOREIGN KEY (provider_id) REFERENCES providers(id),
  INDEX idx_provider (provider_id)
) ENGINE=InnoDB;

-- ── KYC DOCUMENTS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kyc_docs (
  id               VARCHAR(36) PRIMARY KEY,
  user_id          VARCHAR(36) NOT NULL,
  doc_type         VARCHAR(30) NOT NULL,  -- canonical: nid, passport, birth_certificate, driving_license (config/kyc.js)
  doc_number       VARCHAR(80) NOT NULL,
  front_image      LONGTEXT,
  back_image       LONGTEXT,
  selfie_image     LONGTEXT,
  status           ENUM('pending','verified','rejected') DEFAULT 'pending',
  rejection_reason VARCHAR(255),
  reviewed_by      VARCHAR(36),
  submitted_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at      TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id),
  INDEX idx_status (status)
) ENGINE=InnoDB;

-- ── WALLET TRANSACTIONS ───────────────────────────────────
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     VARCHAR(36) NOT NULL,
  type        ENUM('credit','debit') NOT NULL,
  amount      DECIMAL(12,2) NOT NULL,
  description_bn VARCHAR(200),
  description_en VARCHAR(200),
  method      VARCHAR(30),
  ref_id      VARCHAR(60),
  balance_after DECIMAL(12,2),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_user (user_id)
) ENGINE=InnoDB;

-- ── NOTIFICATIONS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     VARCHAR(36) NOT NULL,
  icon        VARCHAR(10) DEFAULT '🔔',
  type        ENUM('booking','payment','promo','alert','system') DEFAULT 'system',
  title_bn    VARCHAR(200),
  title_en    VARCHAR(200),
  body_bn     TEXT,
  body_en     TEXT,
  is_read     TINYINT(1) DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id),
  INDEX idx_read (is_read)
) ENGINE=InnoDB;

-- ── PROMOS / COUPONS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS promos (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  code         VARCHAR(30) UNIQUE NOT NULL,
  title_bn     VARCHAR(150),
  title_en     VARCHAR(150),
  discount_pct TINYINT,
  discount_amt DECIMAL(10,2),
  min_order    DECIMAL(10,2) DEFAULT 0.00,
  max_uses     INT DEFAULT 100,
  used_count   INT DEFAULT 0,
  valid_from   DATE,
  valid_until  DATE,
  category_id  INT,
  is_active    TINYINT(1) DEFAULT 1,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ── LOYALTY POINTS LOG ────────────────────────────────────
CREATE TABLE IF NOT EXISTS loyalty_log (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     VARCHAR(36) NOT NULL,
  points      INT NOT NULL,
  reason_bn   VARCHAR(200),
  reason_en   VARCHAR(200),
  booking_id  VARCHAR(36),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── BLOOD DONORS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blood_donors (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      VARCHAR(36),
  name         VARCHAR(120) NOT NULL,
  blood_group  VARCHAR(6) NOT NULL,
  phone        VARCHAR(20) NOT NULL,
  area_bn      VARCHAR(100),
  area_en      VARCHAR(100),
  district     VARCHAR(60),
  is_available TINYINT(1) DEFAULT 1,
  total_donated INT DEFAULT 0,
  last_donated  DATE,
  latitude     DECIMAL(10,8),
  longitude    DECIMAL(11,8),
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ── COMPLAINTS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS complaints (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       VARCHAR(36) NOT NULL,
  booking_id    VARCHAR(36),
  subject       VARCHAR(255),
  description   TEXT,
  status        ENUM('open','in_review','resolved','closed') DEFAULT 'open',
  priority      ENUM('low','medium','high','urgent') DEFAULT 'medium',
  assigned_to   VARCHAR(36),
  resolved_note TEXT,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- ── REFRESH TOKENS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     VARCHAR(36) NOT NULL,
  token       VARCHAR(512) NULL,          -- legacy column (unused; hash is canonical)
  token_hash  VARCHAR(64),               -- SHA-256 of the opaque token (only this is stored)
  family_id   VARCHAR(36),               -- rotation family (reuse → revoke whole family)
  revoked     TINYINT(1) DEFAULT 0,
  replaced_by VARCHAR(64),               -- token_hash that superseded this one
  used_at     TIMESTAMP NULL,
  expires_at  TIMESTAMP NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id),
  INDEX idx_rt_token_hash (token_hash),
  INDEX idx_rt_family (family_id)
) ENGINE=InnoDB;

-- ── PUSH SUBSCRIPTIONS (Web-Push) ─────────────────────────
-- user_id is a UUID (VARCHAR) to match users.id — an earlier INT definition
-- silently broke delivery.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    VARCHAR(36) NOT NULL,
  endpoint   VARCHAR(600) NOT NULL,
  `keys`     JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_ep (endpoint(255)),
  INDEX idx_ps_user (user_id)
) ENGINE=InnoDB;

-- ── MEDIA ASSETS (object-storage metadata) ───────────────
-- New uploads store object_key + cdn_url here instead of base64 in-row.
CREATE TABLE IF NOT EXISTS media_assets (
  id         VARCHAR(36) PRIMARY KEY,
  owner_id   VARCHAR(36) NOT NULL,
  kind       VARCHAR(30) NOT NULL,   -- avatar | kyc | proof
  object_key VARCHAR(512) NOT NULL,
  cdn_url    VARCHAR(800),
  mime_type  VARCHAR(100),
  size       INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ma_owner (owner_id),
  INDEX idx_ma_kind (kind)
) ENGINE=InnoDB;

-- ══════════════════════════════════════════════════════════
--  SEED DATA
-- ══════════════════════════════════════════════════════════

-- Categories
INSERT IGNORE INTO categories (slug,name_bn,name_en,icon,color,base_price,sort_order) VALUES
('electrician',   'ইলেকট্রিশিয়ান',      'Electrician',      '⚡','#F59E0B', 400, 1),
('plumber',       'প্লাম্বার',            'Plumber',          '🔧','#3B82F6', 350, 2),
('nurse',         'নার্স / স্বাস্থ্য',    'Nurse / Health',   '🏥','#EF4444', 500, 3),
('cleaner',       'পরিষ্কার সেবা',        'Cleaning',         '🧹','#8B5CF6', 300, 4),
('ac_repair',     'এসি মেরামত',           'AC Repair',        '❄️','#06B6D4', 600, 5),
('carpenter',     'কাঠমিস্ত্রি',          'Carpenter',        '🪚','#D97706', 400, 6),
('painter',       'পেইন্টার',             'Painter',          '🖌️','#10B981', 350, 7),
('driver',        'ড্রাইভার',             'Driver',           '🚗','#6366F1', 300, 8),
('security',      'নিরাপত্তা প্রহরী',     'Security Guard',   '🛡️','#1DBF73', 400, 9),
('tutor',         'গৃহশিক্ষক',            'Home Tutor',       '📚','#F97316', 350, 10),
('cook',          'রাঁধুনি',              'Cook',             '👨‍🍳','#EC4899', 400, 11),
('pest_control',  'কীটপতঙ্গ নিয়ন্ত্রণ', 'Pest Control',     '🦟','#84CC16', 500, 12);

-- ── SOS ALERTS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sos_alerts (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      VARCHAR(36) NOT NULL,
  type         ENUM('harassment','fraud','unsafe','emergency','other') NOT NULL,
  description  TEXT,
  booking_id   VARCHAR(36),
  lat          DECIMAL(10,6),
  lng          DECIMAL(10,6),
  status       ENUM('open','in_progress','resolved','dismissed') DEFAULT 'open',
  admin_note   TEXT,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_user   (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── PAYMENTS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                   VARCHAR(36) PRIMARY KEY,
  booking_id           VARCHAR(36),
  user_id              VARCHAR(36) NOT NULL,
  amount               DECIMAL(12,2) NOT NULL,
  currency             VARCHAR(5) DEFAULT 'BDT',
  method               VARCHAR(50) DEFAULT 'sslcommerz',
  status               ENUM('pending','success','failed','refunded','cancelled') DEFAULT 'pending',
  gateway_tran_id      VARCHAR(100),
  gateway_val_id       VARCHAR(100),
  gateway_session_key  VARCHAR(255),
  paid_at              TIMESTAMP NULL,
  refunded_at          TIMESTAMP NULL,
  refund_reason        TEXT,
  admin_note           TEXT,
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)    REFERENCES users(id),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
  INDEX idx_user       (user_id),
  INDEX idx_booking    (booking_id),
  INDEX idx_status     (status),
  INDEX idx_gateway_id (gateway_tran_id)
) ENGINE=InnoDB;

-- ── MICROLOANS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS microloans (
  id            VARCHAR(36) PRIMARY KEY,
  user_id       VARCHAR(36) NOT NULL,
  provider_id   VARCHAR(36),
  full_name     VARCHAR(120) NOT NULL,
  phone         VARCHAR(20)  NOT NULL,
  purpose       TEXT,
  amount        DECIMAL(12,2) NOT NULL,
  tenure_months INT NOT NULL DEFAULT 12,
  interest_rate DECIMAL(5,2) NOT NULL DEFAULT 9.00,
  loan_score    INT NOT NULL DEFAULT 0,
  status        ENUM('pending','approved','disbursed','rejected','repaid') DEFAULT 'pending',
  admin_note    TEXT,
  reference_no  VARCHAR(20) UNIQUE,
  applied_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at   TIMESTAMP NULL,
  reviewed_by   VARCHAR(36),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user   (user_id),
  INDEX idx_status (status)
) ENGINE=InnoDB;

-- ── AUDIT LOG (admin actions, analytics access, money movement) ──
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  actor_id    VARCHAR(36),
  actor_role  VARCHAR(20),
  action      VARCHAR(60) NOT NULL,
  target_type VARCHAR(40),
  target_id   VARCHAR(80),
  ip          VARCHAR(60),
  meta        JSON,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_action (action),
  INDEX idx_actor  (actor_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB;

-- ── ALTER existing tables (safe, idempotent) ─────────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS completion_proof TEXT NULL AFTER note;
ALTER TABLE kyc_docs ADD COLUMN IF NOT EXISTS certificate_image LONGTEXT NULL AFTER selfie_image;
-- Distinguishes booking payments from wallet top-ups (server-authoritative crediting)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS purpose VARCHAR(20) DEFAULT 'booking' AFTER method;

-- Referral tracking (see migration 005_referrals.sql)
CREATE TABLE IF NOT EXISTS referrals (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  referrer_id VARCHAR(36) NOT NULL,
  referred_id VARCHAR(36) NOT NULL,
  status      ENUM('pending','active') DEFAULT 'pending',
  bonus_paid  DECIMAL(10,2) DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_ref (referrer_id, referred_id)
) ENGINE=InnoDB;

-- No default admin is seeded (removed admin123 backdoor).
-- Create the first admin securely with:  npm run create-admin
--   (requires ADMIN_EMAIL and ADMIN_PASSWORD env vars; see scripts/createAdmin.js)
