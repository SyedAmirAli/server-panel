-- AlterTable
ALTER TABLE `buckets` ADD COLUMN `lockedPrefixes` JSON NOT NULL DEFAULT (JSON_ARRAY());
