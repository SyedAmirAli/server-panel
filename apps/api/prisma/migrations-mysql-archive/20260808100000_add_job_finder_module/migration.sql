-- CreateTable
CREATE TABLE `candidate_profiles` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `headline` TEXT NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(64) NULL,
    `location` VARCHAR(191) NULL,
    `timezone` VARCHAR(64) NULL,
    `availability` TEXT NULL,
    `summary` TEXT NULL,
    `titles` JSON NOT NULL,
    `skills` JSON NOT NULL,
    `experience` JSON NOT NULL,
    `education` JSON NOT NULL,
    `projects` JSON NOT NULL,
    `certifications` JSON NULL,
    `languages` JSON NULL,
    `links` JSON NULL,
    `sourceType` VARCHAR(32) NOT NULL DEFAULT 'repo',
    `sourcePath` TEXT NULL,
    `sourceHash` VARCHAR(128) NULL,
    `rawSource` LONGTEXT NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `candidate_profiles_isDefault_idx`(`isDefault`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_sources` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(64) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `adapter` VARCHAR(64) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `config` JSON NULL,
    `requiresCredentials` BOOLEAN NOT NULL DEFAULT false,
    `credentialsReady` BOOLEAN NOT NULL DEFAULT true,
    `lastRunAt` DATETIME(3) NULL,
    `lastRunStatus` VARCHAR(32) NULL,
    `lastRunError` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `job_sources_key_key`(`key`),
    INDEX `job_sources_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_postings` (
    `id` VARCHAR(191) NOT NULL,
    `sourceId` VARCHAR(191) NULL,
    `externalId` VARCHAR(191) NULL,
    `dedupeHash` VARCHAR(64) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `company` VARCHAR(191) NOT NULL,
    `companyUrl` TEXT NULL,
    `location` VARCHAR(191) NULL,
    `isRemote` BOOLEAN NOT NULL DEFAULT false,
    `employmentType` VARCHAR(64) NULL,
    `salaryRaw` VARCHAR(191) NULL,
    `salaryMin` INTEGER NULL,
    `salaryMax` INTEGER NULL,
    `currency` VARCHAR(8) NULL,
    `url` TEXT NOT NULL,
    `applyUrl` TEXT NULL,
    `applyEmail` VARCHAR(191) NULL,
    `description` LONGTEXT NULL,
    `tags` JSON NULL,
    `requirements` JSON NULL,
    `postedAt` DATETIME(3) NULL,
    `discoveredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'new',
    `raw` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `job_postings_dedupeHash_key`(`dedupeHash`),
    INDEX `job_postings_postedAt_idx`(`postedAt`),
    INDEX `job_postings_status_idx`(`status`),
    INDEX `job_postings_sourceId_idx`(`sourceId`),
    INDEX `job_postings_discoveredAt_idx`(`discoveredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_matches` (
    `id` VARCHAR(191) NOT NULL,
    `postingId` VARCHAR(191) NOT NULL,
    `profileId` VARCHAR(191) NOT NULL,
    `stars` INTEGER NOT NULL,
    `score` INTEGER NOT NULL,
    `verdict` VARCHAR(64) NULL,
    `summary` TEXT NULL,
    `strengths` JSON NULL,
    `gaps` JSON NULL,
    `matchedSkills` JSON NULL,
    `missingSkills` JSON NULL,
    `model` VARCHAR(120) NULL,
    `scoredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `job_matches_stars_idx`(`stars`),
    UNIQUE INDEX `job_matches_postingId_profileId_key`(`postingId`, `profileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_applications` (
    `id` VARCHAR(191) NOT NULL,
    `postingId` VARCHAR(191) NOT NULL,
    `profileId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'draft',
    `channel` VARCHAR(32) NOT NULL DEFAULT 'email',
    `toEmail` VARCHAR(191) NULL,
    `subject` TEXT NULL,
    `body` LONGTEXT NULL,
    `gapsNote` TEXT NULL,
    `model` VARCHAR(120) NULL,
    `sentMessageId` VARCHAR(191) NULL,
    `sentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `job_applications_status_idx`(`status`),
    INDEX `job_applications_postingId_idx`(`postingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_runs` (
    `id` VARCHAR(191) NOT NULL,
    `trigger` VARCHAR(32) NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'running',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `sourcesRun` JSON NULL,
    `stats` JSON NULL,
    `error` TEXT NULL,

    INDEX `job_runs_status_idx`(`status`),
    INDEX `job_runs_startedAt_idx`(`startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_run_logs` (
    `id` VARCHAR(191) NOT NULL,
    `runId` VARCHAR(191) NOT NULL,
    `seq` INTEGER NOT NULL,
    `level` VARCHAR(16) NOT NULL DEFAULT 'info',
    `source` VARCHAR(64) NULL,
    `message` TEXT NOT NULL,
    `data` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `job_run_logs_runId_seq_idx`(`runId`, `seq`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_finder_settings` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'default',
    `cronEnabled` BOOLEAN NOT NULL DEFAULT false,
    `cronExpression` VARCHAR(64) NOT NULL DEFAULT '0 */6 * * *',
    `lookbackHours` INTEGER NOT NULL DEFAULT 24,
    `minStars` INTEGER NOT NULL DEFAULT 3,
    `maxJobsPerRun` INTEGER NOT NULL DEFAULT 60,
    `scoringModel` VARCHAR(120) NOT NULL DEFAULT 'auto/best-fast',
    `writingModel` VARCHAR(120) NOT NULL DEFAULT 'auto/best-coding',
    `searchModel` VARCHAR(120) NOT NULL DEFAULT 'tllm/sonar-pro',
    `keywords` JSON NULL,
    `locations` JSON NULL,
    `excludeCompanies` JSON NULL,
    `activeProfileId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `job_postings` ADD CONSTRAINT `job_postings_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `job_sources`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_matches` ADD CONSTRAINT `job_matches_postingId_fkey` FOREIGN KEY (`postingId`) REFERENCES `job_postings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_matches` ADD CONSTRAINT `job_matches_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `candidate_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_applications` ADD CONSTRAINT `job_applications_postingId_fkey` FOREIGN KEY (`postingId`) REFERENCES `job_postings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_applications` ADD CONSTRAINT `job_applications_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `candidate_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_run_logs` ADD CONSTRAINT `job_run_logs_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `job_runs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

