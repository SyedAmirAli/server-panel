-- CreateTable
CREATE TABLE `ApiKey` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `keyHash` VARCHAR(191) NOT NULL,
    `keyPrefix` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `allowedFrom` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `lastUsedAt` DATETIME(3) NULL,

    UNIQUE INDEX `ApiKey_keyHash_key`(`keyHash`),
    INDEX `ApiKey_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Mailbox` (
    `id` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NOT NULL,
    `imapHost` VARCHAR(191) NOT NULL,
    `imapUser` VARCHAR(191) NOT NULL,
    `imapPassword` TEXT NOT NULL,
    `smtpHost` VARCHAR(191) NOT NULL,
    `smtpUser` VARCHAR(191) NOT NULL,
    `smtpPassword` TEXT NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastSyncUid` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Mailbox_address_key`(`address`),
    INDEX `Mailbox_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MailMessage` (
    `id` VARCHAR(191) NOT NULL,
    `mailboxId` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(255) NOT NULL,
    `uid` INTEGER NULL,
    `from` VARCHAR(191) NOT NULL,
    `to` JSON NOT NULL,
    `subject` TEXT NOT NULL,
    `snippet` TEXT NOT NULL,
    `body` LONGTEXT NOT NULL,
    `html` LONGTEXT NULL,
    `receivedAt` DATETIME(3) NOT NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `syncedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MailMessage_mailboxId_receivedAt_idx`(`mailboxId`, `receivedAt`),
    UNIQUE INDEX `MailMessage_mailboxId_messageId_key`(`mailboxId`, `messageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SentMessage` (
    `id` VARCHAR(191) NOT NULL,
    `apiKeyId` VARCHAR(191) NULL,
    `from` VARCHAR(191) NOT NULL,
    `to` JSON NOT NULL,
    `subject` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'queued',
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SentMessage_status_idx`(`status`),
    INDEX `SentMessage_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MailMessage` ADD CONSTRAINT `MailMessage_mailboxId_fkey` FOREIGN KEY (`mailboxId`) REFERENCES `Mailbox`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SentMessage` ADD CONSTRAINT `SentMessage_apiKeyId_fkey` FOREIGN KEY (`apiKeyId`) REFERENCES `ApiKey`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
