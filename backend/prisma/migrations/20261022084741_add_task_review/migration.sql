-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedByName" TEXT;
