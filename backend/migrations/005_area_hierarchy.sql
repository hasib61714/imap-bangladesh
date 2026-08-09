-- ═══════════════════════════════════════════════════════════
--  MIGRATION : 005_area_hierarchy   (plan id M-05)
--  PURPOSE   : Create the Bangladesh location hierarchy that provider
--              coverage and discovery filtering are built on.
--  DEPENDS   : 003_formalise_runtime_tables
--  CLASS     : REVERSIBLE
--  RISK      : LOW
--  PRE-CHECK : SELECT COUNT(*) FROM information_schema.tables
--                WHERE table_schema = DATABASE() AND table_name = 'area';
--  VALIDATE  : table present; self-referencing FK enforced;
--              SELECT COUNT(*) FROM area  →  0  (see §Data below)
--  ROLLBACK  : DROP TABLE area
--  STOP IF   : any row is inserted from a source that is not an official
--              administrative list — see §Data.
--  APPROVAL  : loading the reference data requires an official source,
--              named and dated by the project owner.
--
--  Model: docs/architecture/DATA-ARCHITECTURE.md §8
--      Division → District → Upazila/Thana → Area/Ward → landmark text
--
--  Coverage is expressed as a SET OF AREA REFERENCES, not a radius,
--  because that is how providers actually describe where they work.
--  `kind` is a discriminator on one self-referencing table so that a
--  second country is a data change rather than a schema change (I-05).
--
--  §Data — DELIBERATELY EMPTY
--  --------------------------
--  docs/implementation/DATABASE-IMPLEMENTATION-PLAN.md gives M-05 the
--  stop condition "source is not an official list", and no official
--  Bangladesh administrative dataset has been supplied to this project.
--
--  Inventing division, district and upazila rows would be fabricated
--  product data, which Phase 4 §23 prohibits outright — and it would be
--  the same class of defect as the unverified hotline numbers still open
--  as R-1009.
--
--  This migration therefore creates the structure and loads NOTHING.
--  The data load is a separate migration, blocked on the project owner
--  naming a verified source (e.g. the Bangladesh Bureau of Statistics
--  geocode list), with `source` and `verified_at` recorded per row.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS area (
  id          VARCHAR(36) PRIMARY KEY,
  parent_id   VARCHAR(36) NULL,
  kind        ENUM('division','district','upazila','area') NOT NULL,
  name_bn     VARCHAR(120) NOT NULL,
  name_en     VARCHAR(120) NOT NULL,
  code        VARCHAR(20) NULL,
  centroid_lat DECIMAL(10,8) NULL,
  centroid_lng DECIMAL(11,8) NULL,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  -- Provenance is part of the row, not a comment: an area that cannot
  -- name its source cannot be trusted to filter a booking.
  source      VARCHAR(160) NULL,
  verified_at DATETIME NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_parent (parent_id),
  INDEX idx_kind   (kind, is_active),
  INDEX idx_name_en (name_en),
  CONSTRAINT fk_area_parent FOREIGN KEY (parent_id)
    REFERENCES area (id) ON DELETE RESTRICT
) ENGINE=InnoDB;
