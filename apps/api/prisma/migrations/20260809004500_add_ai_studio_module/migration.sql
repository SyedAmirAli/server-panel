-- AlterTable
ALTER TABLE "candidate_profiles" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "preferredTitles" JSONB;

-- AlterTable
ALTER TABLE "job_applications" ADD COLUMN     "coverLetterDocumentId" TEXT,
ADD COLUMN     "emailConfigId" TEXT,
ADD COLUMN     "resumeDocumentId" TEXT;

-- CreateTable
CREATE TABLE "studio_conversations" (
    "id" TEXT NOT NULL,
    "profileId" TEXT,
    "postingId" TEXT,
    "mode" VARCHAR(32) NOT NULL DEFAULT 'general',
    "title" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" VARCHAR(16) NOT NULL,
    "content" TEXT,
    "toolName" VARCHAR(120),
    "toolArgs" JSONB,
    "toolResult" JSONB,
    "references" JSONB,
    "model" VARCHAR(120),
    "tokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "studio_conversations_updatedAt_idx" ON "studio_conversations"("updatedAt");

-- CreateIndex
CREATE INDEX "studio_conversations_profileId_idx" ON "studio_conversations"("profileId");

-- CreateIndex
CREATE INDEX "studio_messages_conversationId_createdAt_idx" ON "studio_messages"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "studio_conversations" ADD CONSTRAINT "studio_conversations_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "candidate_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_conversations" ADD CONSTRAINT "studio_conversations_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "job_postings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_messages" ADD CONSTRAINT "studio_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "studio_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

