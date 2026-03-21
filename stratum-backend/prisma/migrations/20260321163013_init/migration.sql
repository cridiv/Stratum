-- CreateTable
CREATE TABLE "interviews" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL,
    "speakerCount" INTEGER NOT NULL,
    "chunkCount" INTEGER NOT NULL,
    "audit" JSONB NOT NULL,
    "scores" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chunks" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "chunkId" TEXT NOT NULL,
    "transcriptText" TEXT,
    "sentiment" TEXT,
    "words" JSONB,
    "speakerId" TEXT,
    "speakerConfidence" DOUBLE PRECISION,
    "crosstalk" BOOLEAN NOT NULL DEFAULT false,
    "startTime" DOUBLE PRECISION NOT NULL,
    "endTime" DOUBLE PRECISION NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL,
    "acoustic" JSONB,
    "emotion" JSONB,
    "hesitationDetected" BOOLEAN NOT NULL DEFAULT false,
    "energyDrop" BOOLEAN NOT NULL DEFAULT false,
    "pitchInstability" BOOLEAN NOT NULL DEFAULT false,
    "crosstalkDetected" BOOLEAN NOT NULL DEFAULT false,
    "audioUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "interviews_interviewId_key" ON "interviews"("interviewId");

-- CreateIndex
CREATE INDEX "chunks_interviewId_idx" ON "chunks"("interviewId");

-- CreateIndex
CREATE INDEX "chunks_chunkId_idx" ON "chunks"("chunkId");

-- AddForeignKey
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("interviewId") ON DELETE CASCADE ON UPDATE CASCADE;
