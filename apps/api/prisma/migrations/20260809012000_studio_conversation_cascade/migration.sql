-- DropForeignKey
ALTER TABLE "studio_conversations" DROP CONSTRAINT "studio_conversations_profileId_fkey";

-- AddForeignKey
ALTER TABLE "studio_conversations" ADD CONSTRAINT "studio_conversations_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

