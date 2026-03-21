import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InterviewService {
  private readonly logger = new Logger(InterviewService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Save a complete pipeline result to the database.
   * Writes one interview record and one chunk record per chunk.
   * audioUrlMap maps chunkId → Cloudinary URL.
   */
  async saveResult(
    pipelineOutput: any,
    filename:       string,
    audioUrlMap:    Map<string, string>,
  ) {
    const { chunks, audit, scores } = pipelineOutput;
    const interviewId = pipelineOutput.interview_id;

    // Derive interview-level metadata from chunks
    const duration     = chunks.at(-1)?.timing?.end ?? 0;
    const speakerIds   = [...new Set(chunks.map((c: any) => c.speaker?.id).filter(Boolean))];
    const speakerCount = speakerIds.length;

    this.logger.log(`Saving interview ${interviewId} — ${chunks.length} chunks`);

    // Write interview record
    const interview = await this.prisma.interview.create({
      data: {
        interviewId,
        filename,
        duration,
        speakerCount,
        chunkCount: chunks.length,
        audit,
        scores: scores ?? undefined,
      },
    });

    // Write all chunks in one batch
    await this.prisma.chunk.createMany({
      data: chunks.map((chunk: any) => ({
        interviewId,
        chunkIndex:        chunk.index,
        chunkId:           chunk.id,
        transcriptText:    chunk.transcript?.text    ?? null,
        sentiment:         chunk.transcript?.sentiment ?? null,
        words:             chunk.transcript?.words   ?? undefined,
        speakerId:         chunk.speaker?.id         ?? null,
        speakerConfidence: chunk.speaker?.confidence ?? null,
        crosstalk:         chunk.speaker?.crosstalk  ?? false,
        startTime:         chunk.timing?.start       ?? 0,
        endTime:           chunk.timing?.end         ?? 0,
        duration:          chunk.timing?.duration    ?? 0,
        acoustic:          chunk.acoustic            ?? undefined,
        emotion:           chunk.emotion             ?? undefined,
        hesitationDetected: chunk.flags?.hesitation_detected === true,
        energyDrop:         chunk.flags?.energy_drop         === true,
        pitchInstability:   chunk.flags?.pitch_instability   === true,
        crosstalkDetected:  chunk.flags?.crosstalk_detected  === true,
        audioUrl:           audioUrlMap.get(chunk.id)        ?? null,
      })),
    });

    this.logger.log(`Interview ${interviewId} saved successfully`);
    return interview;
  }

  /**
   * List all interviews — most recent first.
   * Returns lightweight records without chunks.
   */
  async findAll() {
    return this.prisma.interview.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id:           true,
        interviewId:  true,
        filename:     true,
        duration:     true,
        speakerCount: true,
        chunkCount:   true,
        createdAt:    true,
      },
    });
  }

  /**
   * Get one interview with all its chunks.
   */
  async findOne(interviewId: string) {
    const interview = await this.prisma.interview.findUnique({
      where:   { interviewId },
      include: { chunks: { orderBy: { chunkIndex: 'asc' } } },
    });

    if (!interview) {
      throw new NotFoundException(`Interview ${interviewId} not found`);
    }

    return interview;
  }

  /**
   * Get just the chunks for an interview — paginated.
   */
  async findChunks(interviewId: string, skip = 0, take = 20) {
    return this.prisma.chunk.findMany({
      where:   { interviewId },
      orderBy: { chunkIndex: 'asc' },
      skip,
      take,
    });
  }

  /**
   * Get just the audit findings for an interview.
   */
  async findAudit(interviewId: string) {
    const interview = await this.prisma.interview.findUnique({
      where:  { interviewId },
      select: { audit: true, scores: true },
    });

    if (!interview) {
      throw new NotFoundException(`Interview ${interviewId} not found`);
    }

    return interview;
  }
}