-- CreateTable
CREATE TABLE `email_configs` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `host` VARCHAR(255) NOT NULL,
    `port` INTEGER NOT NULL DEFAULT 587,
    `username` VARCHAR(255) NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `tls` JSON NULL,
    `requireTLS` BOOLEAN NOT NULL DEFAULT false,
    `secure` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `email_configs_username_key`(`username`),
    INDEX `email_configs_name_idx`(`name`),
    INDEX `email_configs_host_port_idx`(`host`, `port`),
    INDEX `email_configs_username_idx`(`username`),
    INDEX `email_configs_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
