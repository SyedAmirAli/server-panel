-- AlterTable
ALTER TABLE `AuditLog` MODIFY `actorType` VARCHAR(32) NOT NULL DEFAULT 'system';

-- AlterTable
ALTER TABLE `SentMessage` ADD COLUMN `bcc` JSON NULL,
    ADD COLUMN `cc` JSON NULL;

