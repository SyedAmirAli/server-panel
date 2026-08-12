-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `action` VARCHAR(120) NOT NULL,
    `actorType` VARCHAR(32) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `entityType` VARCHAR(64) NULL,
    `entityId` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `ip` VARCHAR(64) NULL,
    `userAgent` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_action_idx`(`action`),
    INDEX `AuditLog_actorType_actorId_idx`(`actorType`, `actorId`),
    INDEX `AuditLog_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `AuditLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
