import { Module } from '@nestjs/common';
import { InterviewController } from './interview.controller';
import { InterviewService } from './interview.service';
import { CloudinaryService } from './cloudinary.service';
import { FastApiService } from './fastapi.service';

@Module({
  controllers: [InterviewController],
  providers: [
    InterviewService,
    CloudinaryService,
    FastApiService,
  ],
})
export class InterviewModule {}