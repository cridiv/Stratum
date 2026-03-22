-- AlterTable
ALTER TABLE "interviews" ADD COLUMN "formattedParagraphs" TEXT[] NOT NULL DEFAULT ARRAY[]::text[];
