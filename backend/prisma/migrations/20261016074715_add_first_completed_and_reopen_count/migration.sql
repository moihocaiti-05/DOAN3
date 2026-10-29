-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "firstCompletedAt" TIMESTAMP(3),
ADD COLUMN     "reopenCount" INTEGER NOT NULL DEFAULT 0;
