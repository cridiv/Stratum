-- AlterTable
ALTER TABLE "interviews" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "interviews_userId_idx" ON "interviews"("userId");

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
