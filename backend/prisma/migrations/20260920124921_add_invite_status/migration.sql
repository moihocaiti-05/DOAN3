-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- AlterTable
ALTER TABLE "group_members" ADD COLUMN     "status" "InviteStatus" NOT NULL DEFAULT 'ACCEPTED';

-- AlterTable
ALTER TABLE "group_supervisors" ADD COLUMN     "status" "InviteStatus" NOT NULL DEFAULT 'ACCEPTED';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "referenceId" TEXT;
