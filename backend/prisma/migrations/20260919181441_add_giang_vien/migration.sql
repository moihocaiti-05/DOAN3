-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SINH_VIEN', 'GIANG_VIEN');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'SINH_VIEN';

-- CreateTable
CREATE TABLE "group_supervisors" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_supervisors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "group_supervisors_userId_groupId_key" ON "group_supervisors"("userId", "groupId");

-- AddForeignKey
ALTER TABLE "group_supervisors" ADD CONSTRAINT "group_supervisors_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_supervisors" ADD CONSTRAINT "group_supervisors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
