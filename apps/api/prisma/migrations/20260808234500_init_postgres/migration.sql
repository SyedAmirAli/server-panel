-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keySecret" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "allowedFrom" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mailboxes" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "displayName" TEXT,
    "imapHost" TEXT NOT NULL,
    "imapPort" INTEGER NOT NULL DEFAULT 993,
    "imapSecure" BOOLEAN NOT NULL DEFAULT true,
    "imapUser" TEXT NOT NULL,
    "imapPassword" TEXT NOT NULL,
    "smtpHost" TEXT NOT NULL,
    "smtpPort" INTEGER NOT NULL DEFAULT 587,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT false,
    "smtpUser" TEXT NOT NULL,
    "smtpPassword" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncUid" INTEGER,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mailboxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_messages" (
    "id" TEXT NOT NULL,
    "uid" INTEGER,
    "mailboxId" TEXT NOT NULL,
    "messageId" VARCHAR(255) NOT NULL,
    "from" TEXT NOT NULL,
    "to" JSONB NOT NULL,
    "cc" JSONB,
    "bcc" JSONB,
    "subject" TEXT NOT NULL,
    "snippet" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "html" TEXT,
    "flags" JSONB,
    "attachments" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sent_messages" (
    "id" TEXT NOT NULL,
    "apiKeyId" TEXT,
    "from" TEXT NOT NULL,
    "to" JSONB NOT NULL,
    "cc" JSONB,
    "bcc" JSONB,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sent_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" VARCHAR(120) NOT NULL,
    "actorType" VARCHAR(32) NOT NULL DEFAULT 'system',
    "actorId" TEXT,
    "entityType" VARCHAR(64),
    "entityId" TEXT,
    "metadata" JSONB,
    "ip" VARCHAR(64),
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "message" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_configs" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "host" VARCHAR(255) NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 587,
    "username" VARCHAR(255) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "tls" JSONB,
    "requireTLS" BOOLEAN NOT NULL DEFAULT false,
    "secure" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buckets" (
    "id" TEXT NOT NULL,
    "publicId" VARCHAR(12) NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 's3',
    "endpoint" TEXT,
    "region" TEXT,
    "bucketName" TEXT NOT NULL,
    "forcePathStyle" BOOLEAN NOT NULL DEFAULT true,
    "accessKeyEnc" TEXT NOT NULL,
    "secretKeyEnc" TEXT NOT NULL,
    "publicBaseUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lockedPrefixes" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buckets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keySecret" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "allowedBuckets" JSONB NOT NULL,
    "defaultBucketId" TEXT,
    "allowedOrigins" JSONB NOT NULL,
    "allowedIps" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "storage_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_objects" (
    "id" TEXT NOT NULL,
    "bucketId" TEXT NOT NULL,
    "key" VARCHAR(512) NOT NULL,
    "prefix" VARCHAR(255),
    "originalName" VARCHAR(512) NOT NULL,
    "size" INTEGER NOT NULL,
    "contentType" VARCHAR(255) NOT NULL,
    "etag" VARCHAR(255),
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "convertedWebp" BOOLEAN NOT NULL DEFAULT false,
    "compressed" BOOLEAN NOT NULL DEFAULT false,
    "quality" INTEGER,
    "uploadedByType" TEXT NOT NULL DEFAULT 'apikey',
    "uploadedById" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storage_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_profiles" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(191) NOT NULL,
    "headline" TEXT,
    "email" VARCHAR(191),
    "phone" VARCHAR(64),
    "location" VARCHAR(191),
    "timezone" VARCHAR(64),
    "availability" TEXT,
    "summary" TEXT,
    "titles" JSONB NOT NULL,
    "skills" JSONB NOT NULL,
    "experience" JSONB NOT NULL,
    "education" JSONB NOT NULL,
    "projects" JSONB NOT NULL,
    "certifications" JSONB,
    "languages" JSONB,
    "links" JSONB,
    "sourceType" VARCHAR(32) NOT NULL DEFAULT 'repo',
    "sourcePath" TEXT,
    "sourceHash" VARCHAR(128),
    "rawSource" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_sources" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "adapter" VARCHAR(64) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "requiresCredentials" BOOLEAN NOT NULL DEFAULT false,
    "credentialsReady" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" VARCHAR(32),
    "lastRunError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_postings" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "externalId" VARCHAR(191),
    "dedupeHash" VARCHAR(64) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "company" VARCHAR(191) NOT NULL,
    "companyUrl" TEXT,
    "location" VARCHAR(191),
    "isRemote" BOOLEAN NOT NULL DEFAULT false,
    "employmentType" VARCHAR(64),
    "salaryRaw" VARCHAR(191),
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "currency" VARCHAR(8),
    "url" TEXT NOT NULL,
    "applyUrl" TEXT,
    "applyEmail" VARCHAR(191),
    "description" TEXT,
    "tags" JSONB,
    "requirements" JSONB,
    "postedAt" TIMESTAMP(3),
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "status" VARCHAR(32) NOT NULL DEFAULT 'new',
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_postings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_matches" (
    "id" TEXT NOT NULL,
    "postingId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "verdict" VARCHAR(64),
    "summary" TEXT,
    "strengths" JSONB,
    "gaps" JSONB,
    "matchedSkills" JSONB,
    "missingSkills" JSONB,
    "model" VARCHAR(120),
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_applications" (
    "id" TEXT NOT NULL,
    "postingId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'draft',
    "channel" VARCHAR(32) NOT NULL DEFAULT 'email',
    "toEmail" VARCHAR(191),
    "subject" TEXT,
    "body" TEXT,
    "gapsNote" TEXT,
    "model" VARCHAR(120),
    "sentMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" TEXT NOT NULL,
    "trigger" VARCHAR(32) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "sourcesRun" JSONB,
    "stats" JSONB,
    "error" TEXT,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_run_logs" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "level" VARCHAR(16) NOT NULL DEFAULT 'info',
    "source" VARCHAR(64),
    "message" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_run_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_finder_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "cronEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cronExpression" VARCHAR(64) NOT NULL DEFAULT '0 */6 * * *',
    "lookbackHours" INTEGER NOT NULL DEFAULT 24,
    "minStars" INTEGER NOT NULL DEFAULT 3,
    "maxJobsPerRun" INTEGER NOT NULL DEFAULT 60,
    "scoringModel" VARCHAR(120) NOT NULL DEFAULT 'auto/best-fast',
    "writingModel" VARCHAR(120) NOT NULL DEFAULT 'auto/best-coding',
    "extractionModel" VARCHAR(120) NOT NULL DEFAULT 'auto/best-fast',
    "keywords" JSONB,
    "locations" JSONB,
    "excludeCompanies" JSONB,
    "activeProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_finder_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_projects" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" VARCHAR(191) NOT NULL,
    "description" TEXT,
    "role" VARCHAR(191),
    "period" VARCHAR(120),
    "stack" JSONB NOT NULL,
    "metrics" JSONB,
    "note" TEXT,
    "url" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_experiences" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "company" VARCHAR(191) NOT NULL,
    "position" VARCHAR(191) NOT NULL,
    "period" VARCHAR(120) NOT NULL,
    "location" VARCHAR(191),
    "employmentType" VARCHAR(64),
    "points" JSONB NOT NULL,
    "stack" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_experiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_skills" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "category" VARCHAR(64),
    "level" VARCHAR(32),
    "highlighted" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_links" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "url" TEXT NOT NULL,
    "kind" VARCHAR(32) NOT NULL DEFAULT 'other',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_info_items" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "title" VARCHAR(191),
    "rawText" TEXT,
    "bucketId" TEXT,
    "folder" VARCHAR(512),
    "fileName" VARCHAR(512),
    "storageKey" VARCHAR(768),
    "mimeType" VARCHAR(191),
    "sizeBytes" INTEGER,
    "extractionStatus" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "extractionError" TEXT,
    "model" VARCHAR(120),
    "extractedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_info_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_fact_proposals" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "infoItemId" TEXT,
    "targetType" VARCHAR(32) NOT NULL,
    "payload" JSONB NOT NULL,
    "confidence" INTEGER DEFAULT 0,
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "reviewedAt" TIMESTAMP(3),
    "createdRowId" VARCHAR(64),
    "model" VARCHAR(120),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_fact_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_documents" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "postingId" TEXT,
    "applicationId" TEXT,
    "kind" VARCHAR(32) NOT NULL,
    "format" VARCHAR(16) NOT NULL DEFAULT 'pdf',
    "title" VARCHAR(255) NOT NULL,
    "contentJson" JSONB NOT NULL,
    "blocks" JSONB,
    "bucketId" TEXT,
    "folder" VARCHAR(512),
    "fileName" VARCHAR(512),
    "storageKey" VARCHAR(768),
    "sizeBytes" INTEGER,
    "pageCount" INTEGER,
    "warnings" JSONB,
    "model" VARCHAR(120),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resume_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_isActive_idx" ON "api_keys"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "mailboxes_address_key" ON "mailboxes"("address");

-- CreateIndex
CREATE INDEX "mailboxes_isActive_idx" ON "mailboxes"("isActive");

-- CreateIndex
CREATE INDEX "mail_messages_mailboxId_receivedAt_idx" ON "mail_messages"("mailboxId", "receivedAt");

-- CreateIndex
CREATE INDEX "mail_messages_receivedAt_id_idx" ON "mail_messages"("receivedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "mail_messages_mailboxId_messageId_key" ON "mail_messages"("mailboxId", "messageId");

-- CreateIndex
CREATE INDEX "sent_messages_status_idx" ON "sent_messages"("status");

-- CreateIndex
CREATE INDEX "sent_messages_createdAt_idx" ON "sent_messages"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_actorType_actorId_idx" ON "audit_logs"("actorType", "actorId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "email_configs_name_idx" ON "email_configs"("name");

-- CreateIndex
CREATE INDEX "email_configs_host_port_idx" ON "email_configs"("host", "port");

-- CreateIndex
CREATE INDEX "email_configs_username_idx" ON "email_configs"("username");

-- CreateIndex
CREATE INDEX "email_configs_createdAt_idx" ON "email_configs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "email_configs_username_key" ON "email_configs"("username");

-- CreateIndex
CREATE UNIQUE INDEX "buckets_publicId_key" ON "buckets"("publicId");

-- CreateIndex
CREATE INDEX "buckets_isActive_idx" ON "buckets"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "storage_api_keys_keyHash_key" ON "storage_api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "storage_api_keys_isActive_idx" ON "storage_api_keys"("isActive");

-- CreateIndex
CREATE INDEX "storage_objects_bucketId_prefix_idx" ON "storage_objects"("bucketId", "prefix");

-- CreateIndex
CREATE INDEX "storage_objects_createdAt_idx" ON "storage_objects"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "storage_objects_bucketId_key_key" ON "storage_objects"("bucketId", "key");

-- CreateIndex
CREATE INDEX "candidate_profiles_isDefault_idx" ON "candidate_profiles"("isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "job_sources_key_key" ON "job_sources"("key");

-- CreateIndex
CREATE INDEX "job_sources_isActive_idx" ON "job_sources"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "job_postings_dedupeHash_key" ON "job_postings"("dedupeHash");

-- CreateIndex
CREATE INDEX "job_postings_postedAt_idx" ON "job_postings"("postedAt");

-- CreateIndex
CREATE INDEX "job_postings_status_idx" ON "job_postings"("status");

-- CreateIndex
CREATE INDEX "job_postings_sourceId_idx" ON "job_postings"("sourceId");

-- CreateIndex
CREATE INDEX "job_postings_discoveredAt_idx" ON "job_postings"("discoveredAt");

-- CreateIndex
CREATE INDEX "job_matches_stars_idx" ON "job_matches"("stars");

-- CreateIndex
CREATE UNIQUE INDEX "job_matches_postingId_profileId_key" ON "job_matches"("postingId", "profileId");

-- CreateIndex
CREATE INDEX "job_applications_status_idx" ON "job_applications"("status");

-- CreateIndex
CREATE INDEX "job_applications_postingId_idx" ON "job_applications"("postingId");

-- CreateIndex
CREATE INDEX "job_runs_status_idx" ON "job_runs"("status");

-- CreateIndex
CREATE INDEX "job_runs_startedAt_idx" ON "job_runs"("startedAt");

-- CreateIndex
CREATE INDEX "job_run_logs_runId_seq_idx" ON "job_run_logs"("runId", "seq");

-- CreateIndex
CREATE INDEX "profile_projects_profileId_sortOrder_idx" ON "profile_projects"("profileId", "sortOrder");

-- CreateIndex
CREATE INDEX "profile_experiences_profileId_sortOrder_idx" ON "profile_experiences"("profileId", "sortOrder");

-- CreateIndex
CREATE INDEX "profile_skills_profileId_sortOrder_idx" ON "profile_skills"("profileId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "profile_skills_profileId_name_key" ON "profile_skills"("profileId", "name");

-- CreateIndex
CREATE INDEX "profile_links_profileId_sortOrder_idx" ON "profile_links"("profileId", "sortOrder");

-- CreateIndex
CREATE INDEX "profile_info_items_profileId_createdAt_idx" ON "profile_info_items"("profileId", "createdAt");

-- CreateIndex
CREATE INDEX "profile_info_items_extractionStatus_idx" ON "profile_info_items"("extractionStatus");

-- CreateIndex
CREATE INDEX "profile_fact_proposals_profileId_status_idx" ON "profile_fact_proposals"("profileId", "status");

-- CreateIndex
CREATE INDEX "profile_fact_proposals_infoItemId_idx" ON "profile_fact_proposals"("infoItemId");

-- CreateIndex
CREATE INDEX "resume_documents_profileId_createdAt_idx" ON "resume_documents"("profileId", "createdAt");

-- CreateIndex
CREATE INDEX "resume_documents_postingId_idx" ON "resume_documents"("postingId");

-- CreateIndex
CREATE INDEX "resume_documents_applicationId_idx" ON "resume_documents"("applicationId");

-- AddForeignKey
ALTER TABLE "mail_messages" ADD CONSTRAINT "mail_messages_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "mailboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sent_messages" ADD CONSTRAINT "sent_messages_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "buckets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "job_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_matches" ADD CONSTRAINT "job_matches_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "job_postings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_matches" ADD CONSTRAINT "job_matches_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "job_postings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_run_logs" ADD CONSTRAINT "job_run_logs_runId_fkey" FOREIGN KEY ("runId") REFERENCES "job_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_projects" ADD CONSTRAINT "profile_projects_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_experiences" ADD CONSTRAINT "profile_experiences_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_skills" ADD CONSTRAINT "profile_skills_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_links" ADD CONSTRAINT "profile_links_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_info_items" ADD CONSTRAINT "profile_info_items_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_fact_proposals" ADD CONSTRAINT "profile_fact_proposals_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_fact_proposals" ADD CONSTRAINT "profile_fact_proposals_infoItemId_fkey" FOREIGN KEY ("infoItemId") REFERENCES "profile_info_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_documents" ADD CONSTRAINT "resume_documents_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_documents" ADD CONSTRAINT "resume_documents_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "job_postings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_documents" ADD CONSTRAINT "resume_documents_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "job_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

