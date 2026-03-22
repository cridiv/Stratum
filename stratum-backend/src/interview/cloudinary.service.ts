// src/interview/cloudinary.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private readonly baseFolder: string;
  private readonly artifactsRoot: string;
  private readonly isConfigured: boolean;

  constructor(private config: ConfigService) {
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET');

    // Configure Cloudinary once on service init
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });

    this.baseFolder = this.config.get<string>('CLOUDINARY_BASE_FOLDER') || 'stratum';
    // FastAPI artifacts live in stratum-model/sessions by default.
    this.artifactsRoot =
      this.config.get<string>('FASTAPI_ARTIFACTS_ROOT') ||
      path.resolve(process.cwd(), '..', 'stratum-model');

    this.isConfigured = Boolean(cloudName && apiKey && apiSecret);
    if (!this.isConfigured) {
      this.logger.error(
        'Cloudinary credentials are missing. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.',
      );
    } else {
      this.logger.log(
        `Cloudinary configured. Upload base folder: ${this.baseFolder}. Artifacts root: ${this.artifactsRoot}`,
      );
    }
  }

  private ensureConfigured() {
    if (!this.isConfigured) {
      throw new Error('Cloudinary is not configured with valid credentials.');
    }
  }

  private resolveLocalPath(inputPath: string): string {
    if (!inputPath) return inputPath;

    if (path.isAbsolute(inputPath) && fs.existsSync(inputPath)) {
      return inputPath;
    }

    const normalizedInput = inputPath.replace(/\\/g, '/');
    const candidates = [
      path.resolve(process.cwd(), inputPath),
      path.resolve(this.artifactsRoot, inputPath),
      path.resolve(this.artifactsRoot, normalizedInput),
      path.resolve(this.artifactsRoot, 'sessions', path.basename(inputPath)),
    ];

    const found = candidates.find((candidate) => fs.existsSync(candidate));
    return found || inputPath;
  }

  /**
   * Upload a single chunk WAV file to Cloudinary.
   * Files are stored under undertone/{interviewId}/chunks/
   * Returns the secure URL.
   */
  async uploadChunkAudio(
    localPath:   string,
    interviewId: string,
    chunkId:     string,
  ): Promise<string | null> {
    this.ensureConfigured();
    const resolvedPath = this.resolveLocalPath(localPath);

    if (!fs.existsSync(resolvedPath)) {
      this.logger.warn(
        `Chunk audio file not found, skipping upload. Original: ${localPath}, Resolved: ${resolvedPath}`,
      );
      return null;
    }

    try {
      const result = await cloudinary.uploader.upload(resolvedPath, {
        resource_type: 'video',
        folder: `${this.baseFolder}/${interviewId}/chunks`,
        public_id: chunkId,
        overwrite: true,
      });

      this.logger.debug(`Uploaded ${chunkId} → ${result.secure_url}`);
      return result.secure_url;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to upload chunk ${chunkId} from ${resolvedPath}: ${message}`);
      return null;
    }
  }

  /**
   * Upload the full normalized WAV for an interview.
   * Stored under undertone/{interviewId}/full_audio
   * Returns the secure Cloudinary URL.
   */
  async uploadFullAudio(
    localPath:   string,
    interviewId: string,
  ): Promise<string | null> {
    this.ensureConfigured();
    const resolvedPath = this.resolveLocalPath(localPath);

    if (!fs.existsSync(resolvedPath)) {
      this.logger.warn(
        `Full audio file not found, skipping upload. Original: ${localPath}, Resolved: ${resolvedPath}`,
      );
      return null;
    }

    try {
      const result = await cloudinary.uploader.upload(resolvedPath, {
        resource_type: 'video',
        folder: `${this.baseFolder}/${interviewId}`,
        public_id: 'full_audio',
        overwrite: true,
      });

      this.logger.log(`Full audio uploaded -> ${result.secure_url}`);
      return result.secure_url;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to upload full audio from ${resolvedPath}: ${message}`);
      return null;
    }
  }

  /**
   * Upload all chunk audio files for an interview concurrently.
   * Returns a map of chunkId → Cloudinary URL.
   * Chunks that fail to upload get null — stored without audio URL.
   */
  async uploadAllChunks(
    chunks:      any[],
    interviewId: string,
  ): Promise<Map<string, string>> {
    this.ensureConfigured();
    this.logger.log(`Uploading ${chunks.length} chunk audio files to Cloudinary...`);

    const uploads = await Promise.all(
      chunks.map(async (chunk) => {
        const url = await this.uploadChunkAudio(
          chunk.audio_ref,
          interviewId,
          chunk.id,
        );
        return { chunkId: chunk.id, url };
      })
    );

    const urlMap = new Map<string, string>();
    uploads.forEach(({ chunkId, url }) => {
      if (url) urlMap.set(chunkId, url);
    });

    const uploaded = urlMap.size;
    this.logger.log(`Cloudinary upload complete. ${uploaded} / ${chunks.length} chunks uploaded.`);

    if (chunks.length > 0 && uploaded === 0) {
      this.logger.error(
        `No chunk audio files were uploaded for interview ${interviewId}. Check FastAPI artifact paths and Cloudinary credentials.`,
      );
    }

    return urlMap;
  }
}