/*
  Warnings:

  - You are about to drop the column `completedAt` on the `tags` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "tags" DROP COLUMN "completedAt";

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "completedAt" TIMESTAMP(3);
