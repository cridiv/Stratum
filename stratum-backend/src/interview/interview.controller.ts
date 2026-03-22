// src/interview/interview.controller.ts
import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';

import { InterviewService } from './interview.service';
import { CloudinaryService } from './cloudinary.service';
import { FastApiService } from './fastapi.service';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    email: string;
  };
}

// Temp directory for uploaded files before pipeline processes them
const UPLOAD_DIR = join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

@Controller('interviews')
@UseGuards(AuthGuard('jwt'))
export class InterviewController {
  private readonly logger = new Logger(InterviewController.name);

  constructor(
    private interviewService: InterviewService,
    private cloudinaryService: CloudinaryService,
    private fastapiService:    FastApiService,
  ) {}

  // ---------------------------------------------------------------------------
  // POST /api/interviews/analyze
  // ---------------------------------------------------------------------------

  @Post('analyze')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOAD_DIR,
        filename: (req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
          cb(null, `${unique}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
    }),
  )
  async analyze(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AuthenticatedRequest,
    @Query('ground_truth_path') groundTruthPath?: string,
  ) {
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(`Received upload: ${file.originalname} (${(file.size / 1_048_576).toFixed(1)} MB)`);

    try {
      // -- Step 1: Send to FastAPI, run full pipeline
      const pipelineOutput = await this.fastapiService.analyze(
        file.path,
        file.originalname,
        groundTruthPath,
      );

      // -- Step 2: Upload full normalized WAV to Cloudinary
      const fullAudioUrl = await this.cloudinaryService.uploadFullAudio(
        pipelineOutput.normalized_path,
        pipelineOutput.interview_id,
      );

      // -- Step 3: Upload chunk audio files to Cloudinary
      const audioUrlMap = await this.cloudinaryService.uploadAllChunks(
        pipelineOutput.chunks,
        pipelineOutput.interview_id,
      );

      if (!fullAudioUrl && audioUrlMap.size === 0) {
        throw new HttpException(
          'Audio upload to Cloudinary failed. Verify Cloudinary credentials and artifact path configuration.',
          HttpStatus.BAD_GATEWAY,
        );
      }

      // -- Step 4: Save interview + chunks to DB
      const interview = await this.interviewService.saveResult(
        pipelineOutput,
        req.user.userId,
        file.originalname,
        audioUrlMap,
        fullAudioUrl,
      );

      // -- Step 5: Clean up temp upload file
      fs.unlink(file.path, () => {});

      return {
        interviewId:  interview.interviewId,
        chunkCount:   interview.chunkCount,
        speakerCount: interview.speakerCount,
        duration:     interview.duration,
        audioUrl:     interview.audioUrl,
        audit:        pipelineOutput.audit,
        scores:       pipelineOutput.scores ?? null,
      };

    } catch (error) {
      // Clean up on failure
      if (file?.path) fs.unlink(file.path, () => {});
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // GET /api/interviews
  // ---------------------------------------------------------------------------

  @Get()
  async findAll(@Req() req: AuthenticatedRequest) {
    return this.interviewService.findAll(req.user.userId);
  }

  // ---------------------------------------------------------------------------
  // GET /api/interviews/:id
  // ---------------------------------------------------------------------------

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.interviewService.findOne(id, req.user.userId);
  }

  // ---------------------------------------------------------------------------
  // GET /api/interviews/:id/chunks
  // ---------------------------------------------------------------------------

  @Get(':id/chunks')
  async findChunks(
    @Param('id')     id:   string,
    @Req()           req:  AuthenticatedRequest,
    @Query('skip')   skip: string,
    @Query('take')   take: string,
  ) {
    return this.interviewService.findChunks(
      id,
      req.user.userId,
      skip ? parseInt(skip) : 0,
      take ? parseInt(take) : 20,
    );
  }

  // ---------------------------------------------------------------------------
  // GET /api/interviews/:id/audit
  // ---------------------------------------------------------------------------

  @Get(':id/audit')
  async findAudit(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.interviewService.findAudit(id, req.user.userId);
  }

  // ---------------------------------------------------------------------------
  // POST /api/interviews/:id/format-transcript
  // ---------------------------------------------------------------------------

  @Post(':id/format-transcript')
  async formatTranscript(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new HttpException(
        'OPENAI_API_KEY not configured',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      const result = await this.interviewService.formatAndSaveTranscript(
        id,
        req.user.userId,
        apiKey,
      );
      return {
        interviewId: id,
        title: result.title,
        paragraphCount: result.paragraphs.length,
        paragraphs: result.paragraphs,
      };
    } catch (error) {
      this.logger.error(`Format transcript failed for ${id}:`, error);
      throw new HttpException(
        `Failed to format transcript: ${error instanceof Error ? error.message : 'Unknown error'}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}