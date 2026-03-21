import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  UploadedFile,
  UseInterceptors,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';

import { InterviewService } from './interview.service';
import { CloudinaryService } from './cloudinary.service';
import { FastApiService } from './fastapi.service';

// Temp directory for uploaded files before pipeline processes them
const UPLOAD_DIR = join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

@Controller('interviews')
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

      // -- Step 2: Upload chunk audio files to Cloudinary
      const audioUrlMap = await this.cloudinaryService.uploadAllChunks(
        pipelineOutput.chunks,
        pipelineOutput.interview_id,
      );

      // -- Step 3: Save interview + chunks to DB
      const interview = await this.interviewService.saveResult(
        pipelineOutput,
        file.originalname,
        audioUrlMap,
      );

      // -- Step 4: Clean up temp upload file
      fs.unlink(file.path, () => {});

      return {
        interviewId:  interview.interviewId,
        chunkCount:   interview.chunkCount,
        speakerCount: interview.speakerCount,
        duration:     interview.duration,
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
  async findAll() {
    return this.interviewService.findAll();
  }

  // ---------------------------------------------------------------------------
  // GET /api/interviews/:id
  // ---------------------------------------------------------------------------

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.interviewService.findOne(id);
  }

  // ---------------------------------------------------------------------------
  // GET /api/interviews/:id/chunks
  // ---------------------------------------------------------------------------

  @Get(':id/chunks')
  async findChunks(
    @Param('id')     id:   string,
    @Query('skip')   skip: string,
    @Query('take')   take: string,
  ) {
    return this.interviewService.findChunks(
      id,
      skip ? parseInt(skip) : 0,
      take ? parseInt(take) : 20,
    );
  }

  // ---------------------------------------------------------------------------
  // GET /api/interviews/:id/audit
  // ---------------------------------------------------------------------------

  @Get(':id/audit')
  async findAudit(@Param('id') id: string) {
    return this.interviewService.findAudit(id);
  }
}