-- CreateTable
CREATE TABLE `buckets` (
    `id` VARCHAR(191) NOT NULL,
    `publicId` VARCHAR(12) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL DEFAULT 's3',
    `endpoint` VARCHAR(191) NULL,
    `region` VARCHAR(191) NULL,
    `bucketName` VARCHAR(191) NOT NULL,
    `forcePathStyle` BOOLEAN NOT NULL DEFAULT true,
    `accessKeyEnc` TEXT NOT NULL,
    `secretKeyEnc` TEXT NOT NULL,
    `publicBaseUrl` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `buckets_publicId_key`(`publicId`),
    INDEX `buckets_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `storage_api_keys` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `keyHash` VARCHAR(191) NOT NULL,
    `keyPrefix` VARCHAR(191) NOT NULL,
    `keySecret` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `allowedBuckets` JSON NOT NULL,
    `defaultBucketId` VARCHAR(191) NULL,
    `allowedOrigins` JSON NOT NULL,
    `allowedIps` JSON NOT NULL,
    `expiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `lastUsedAt` DATETIME(3) NULL,

    UNIQUE INDEX `storage_api_keys_keyHash_key`(`keyHash`),
    INDEX `storage_api_keys_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `storage_objects` (
    `id` VARCHAR(191) NOT NULL,
    `bucketId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(512) NOT NULL,
    `prefix` VARCHAR(255) NULL,
    `originalName` VARCHAR(512) NOT NULL,
    `size` INTEGER NOT NULL,
    `contentType` VARCHAR(255) NOT NULL,
    `etag` VARCHAR(255) NULL,
    `isPrivate` BOOLEAN NOT NULL DEFAULT true,
    `convertedWebp` BOOLEAN NOT NULL DEFAULT false,
    `compressed` BOOLEAN NOT NULL DEFAULT false,
    `quality` INTEGER NULL,
    `uploadedByType` VARCHAR(191) NOT NULL DEFAULT 'apikey',
    `uploadedById` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `storage_objects_bucketId_prefix_idx`(`bucketId`, `prefix`),
    INDEX `storage_objects_createdAt_idx`(`createdAt`),
    UNIQUE INDEX `storage_objects_bucketId_key_key`(`bucketId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `storage_objects` ADD CONSTRAINT `storage_objects_bucketId_fkey` FOREIGN KEY (`bucketId`) REFERENCES `buckets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
