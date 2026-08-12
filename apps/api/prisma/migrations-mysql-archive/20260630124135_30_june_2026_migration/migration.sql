-- DropForeignKey
ALTER TABLE `mail_messages` DROP FOREIGN KEY `MailMessage_mailboxId_fkey`;

-- DropForeignKey
ALTER TABLE `sent_messages` DROP FOREIGN KEY `SentMessage_apiKeyId_fkey`;

-- AlterTable
ALTER TABLE `audit_logs` ADD COLUMN `message` TEXT NULL;

-- AddForeignKey
ALTER TABLE `mail_messages` ADD CONSTRAINT `mail_messages_mailboxId_fkey` FOREIGN KEY (`mailboxId`) REFERENCES `mailboxes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sent_messages` ADD CONSTRAINT `sent_messages_apiKeyId_fkey` FOREIGN KEY (`apiKeyId`) REFERENCES `api_keys`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `api_keys` RENAME INDEX `ApiKey_isActive_idx` TO `api_keys_isActive_idx`;

-- RenameIndex
ALTER TABLE `api_keys` RENAME INDEX `ApiKey_keyHash_key` TO `api_keys_keyHash_key`;

-- RenameIndex
ALTER TABLE `audit_logs` RENAME INDEX `AuditLog_action_idx` TO `audit_logs_action_idx`;

-- RenameIndex
ALTER TABLE `audit_logs` RENAME INDEX `AuditLog_actorType_actorId_idx` TO `audit_logs_actorType_actorId_idx`;

-- RenameIndex
ALTER TABLE `audit_logs` RENAME INDEX `AuditLog_createdAt_idx` TO `audit_logs_createdAt_idx`;

-- RenameIndex
ALTER TABLE `audit_logs` RENAME INDEX `AuditLog_entityType_entityId_idx` TO `audit_logs_entityType_entityId_idx`;

-- RenameIndex
ALTER TABLE `mail_messages` RENAME INDEX `MailMessage_mailboxId_messageId_key` TO `mail_messages_mailboxId_messageId_key`;

-- RenameIndex
ALTER TABLE `mail_messages` RENAME INDEX `MailMessage_mailboxId_receivedAt_idx` TO `mail_messages_mailboxId_receivedAt_idx`;

-- RenameIndex
ALTER TABLE `mailboxes` RENAME INDEX `Mailbox_address_key` TO `mailboxes_address_key`;

-- RenameIndex
ALTER TABLE `mailboxes` RENAME INDEX `Mailbox_isActive_idx` TO `mailboxes_isActive_idx`;

-- RenameIndex
ALTER TABLE `sent_messages` RENAME INDEX `SentMessage_createdAt_idx` TO `sent_messages_createdAt_idx`;

-- RenameIndex
ALTER TABLE `sent_messages` RENAME INDEX `SentMessage_status_idx` TO `sent_messages_status_idx`;
