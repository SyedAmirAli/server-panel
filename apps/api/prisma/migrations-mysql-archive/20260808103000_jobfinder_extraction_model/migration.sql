-- Web-search discovery was dropped (gateway search models unavailable), so the
-- `searchModel` setting is repurposed for URL-import extraction.
ALTER TABLE `job_finder_settings`
  CHANGE COLUMN `searchModel` `extractionModel` VARCHAR(120) NOT NULL DEFAULT 'auto/best-fast';
