-- CreateTable
CREATE TABLE "milestone_evaluations" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "rating" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "milestone_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "milestone_evaluations_milestoneId_idx" ON "milestone_evaluations"("milestoneId");

-- CreateIndex
CREATE UNIQUE INDEX "milestone_evaluations_milestoneId_supervisorId_key" ON "milestone_evaluations"("milestoneId", "supervisorId");

-- AddForeignKey
ALTER TABLE "milestone_evaluations" ADD CONSTRAINT "milestone_evaluations_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone_evaluations" ADD CONSTRAINT "milestone_evaluations_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
