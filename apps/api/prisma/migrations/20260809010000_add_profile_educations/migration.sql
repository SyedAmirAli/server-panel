-- CreateTable
CREATE TABLE "profile_educations" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "institution" VARCHAR(191) NOT NULL,
    "degree" VARCHAR(191) NOT NULL,
    "period" VARCHAR(120) NOT NULL,
    "location" VARCHAR(191),
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_educations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "profile_educations_profileId_sortOrder_idx" ON "profile_educations"("profileId", "sortOrder");

-- AddForeignKey
ALTER TABLE "profile_educations" ADD CONSTRAINT "profile_educations_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

