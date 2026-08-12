-- Align legacy PascalCase table names from early migrations with schema @@map names.
RENAME TABLE `ApiKey` TO `api_keys`;
RENAME TABLE `Mailbox` TO `mailboxes`;
RENAME TABLE `MailMessage` TO `mail_messages`;
RENAME TABLE `SentMessage` TO `sent_messages`;
RENAME TABLE `AuditLog` TO `audit_logs`;
