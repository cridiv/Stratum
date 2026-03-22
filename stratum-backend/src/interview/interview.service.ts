// src/interview/interview.service.ts
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
    userId:         string,
    filename:       string,
    audioUrlMap:    Map<string, string>,
    fullAudioUrl:   string | null = null,
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
        userId,
        filename,
        duration,
        speakerCount,
        chunkCount: chunks.length,
        audioUrl: fullAudioUrl ?? undefined,
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
  async findAll(userId: string) {
    return this.prisma.interview.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id:                    true,
        interviewId:           true,
        filename:              true,
        duration:              true,
        speakerCount:          true,
        chunkCount:            true,
        audioUrl:              true,
        title:                 true,
        audit:                 true,
        scores:                true,
        formattedParagraphs:   true,
        createdAt:             true,
      },
    });
  }

  /**
   * Get one interview with all its chunks.
   */
  async findOne(interviewId: string, userId: string) {
    const interview = await this.prisma.interview.findFirst({
      where:   { interviewId, userId },
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
  async findChunks(interviewId: string, userId: string, skip = 0, take = 20) {
    await this.findOne(interviewId, userId);

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
  async findAudit(interviewId: string, userId: string) {
    const interview = await this.prisma.interview.findFirst({
      where:  { interviewId, userId },
      select: { audit: true, scores: true },
    });

    if (!interview) {
      throw new NotFoundException(`Interview ${interviewId} not found`);
    }

    return interview;
  }

  /**
   * Format transcript into paragraphs using OpenAI and save to database.
   * Groups consecutive chunks into natural paragraphs based on semantic flow.
   * Also generates a short title (3-4 words) for the transcript.
   */
  async formatAndSaveTranscript(interviewId: string, userId: string, apiKey: string) {
    await this.findOne(interviewId, userId);

    // Fetch all chunks for this interview
    const chunks = await this.prisma.chunk.findMany({
      where: { interviewId },
      orderBy: { chunkIndex: 'asc' },
      select: {
        id: true,
        transcriptText: true,
      },
    });

    if (!chunks.length) {
      throw new NotFoundException(`No chunks found for interview ${interviewId}`);
    }

    // Build numbered list for OpenAI
    const numbered = chunks
      .map((c, i) => `[${i}] ${c.transcriptText?.trim() || ''}`)
      .join('\n');

    // Get full transcript text for title generation
    const fullTranscript = chunks
      .map(c => c.transcriptText?.trim() || '')
      .filter(Boolean)
      .join(' ');

    const systemPrompt = `You are a transcript formatter. You will receive a list of transcript utterance chunks, each prefixed with an index like [0], [1], [2], etc.

Your ONLY job is to group consecutive chunks that belong to the same natural paragraph — based on semantic flow, topic continuity, and natural speech pacing.

STRICT RULES:
- Do NOT change, rephrase, or reorder any words.
- Do NOT skip any chunks. Every chunk must appear in exactly one group.
- Groups must be consecutive — you cannot reorder chunks.
- Return ONLY valid JSON: an array of arrays of integers (the chunk indices).
- No explanation, no markdown, no extra text. Only the raw JSON array.

Example output format:
[[0,1,2],[3,4],[5,6,7,8],[9]]`;

    const userPrompt = `Here are the transcript chunks:\n\n${numbered}\n\nGroup them into paragraphs. Return only the JSON array of index arrays.`;

    try {
      // Step 1: Generate paragraph groupings
      const groupResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0,
          max_tokens: 1024,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (!groupResponse.ok) {
        const err = await groupResponse.text();
        throw new Error(`OpenAI API error: ${groupResponse.status} — ${err}`);
      }

      const groupData = await groupResponse.json();
      const raw: string = groupData.choices?.[0]?.message?.content ?? '';

      // Strip any accidental markdown fences
      const cleaned = raw.replace(/```json|```/gi, '').trim();

      let indexGroups: number[][];
      try {
        indexGroups = JSON.parse(cleaned);
      } catch {
        throw new Error(`Failed to parse OpenAI response as JSON:\n${cleaned}`);
      }

      // Validate: flat set of indices must cover [0 .. chunks.length - 1] exactly
      const flat = indexGroups.flat();
      if (flat.length !== chunks.length) {
        throw new Error(
          `Grouping returned ${flat.length} indices but expected ${chunks.length}`,
        );
      }

      // Map index groups to paragraph text groups
      const formattedParagraphs = indexGroups.map((group) =>
        group
          .map((i) => chunks[i].transcriptText)
          .filter(Boolean)
          .join(' ')
      );

      // Step 2: Generate title (3-4 words max)
      const titleSystemPrompt = `You are a concise title generator. Generate a very short title (maximum 4 words, ideally 3 words) that captures the essence of a transcript.
The title should be:
- Concise and punchy
- Descriptive of the main topic
- No longer than 4 words
Return ONLY the title text, nothing else.`;

      const titleUserPrompt = `Transcript: "${fullTranscript.substring(0, 1500)}"${fullTranscript.length > 1500 ? '...' : ''}

Generate a 3-4 word title for this transcript.`;

      const titleResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.3,
          max_tokens: 10,
          messages: [
            { role: 'system', content: titleSystemPrompt },
            { role: 'user', content: titleUserPrompt },
          ],
        }),
      });

      if (!titleResponse.ok) {
        const err = await titleResponse.text();
        throw new Error(`OpenAI API error for title: ${titleResponse.status} — ${err}`);
      }

      const titleData = await titleResponse.json();
      const title: string = titleData.choices?.[0]?.message?.content?.trim() ?? 'Untitled';

      // Save formatted paragraphs and title to database
      await this.prisma.interview.update({
        where: { interviewId },
        data: { 
          formattedParagraphs,
          title,
        },
      });

      this.logger.log(`Formatted transcript for interview ${interviewId}: ${formattedParagraphs.length} paragraphs, title: "${title}"`);
      return { paragraphs: formattedParagraphs, title };
    } catch (error) {
      this.logger.error(`Failed to format transcript for ${interviewId}:`, error);
      throw error;
    }
  }
}