-- AlterTable
ALTER TABLE "milestones" ADD COLUMN     "parentId" TEXT;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
