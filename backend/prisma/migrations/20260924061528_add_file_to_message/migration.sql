-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "filePath" TEXT,
ADD COLUMN     "fileSize" INTEGER,
ALTER COLUMN "content" DROP NOT NULL;
