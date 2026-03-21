import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import * as fs from 'fs';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(private config: ConfigService) {
    // Configure Cloudinary once on service init
    cloudinary.config({
      cloud_name: this.config.get('CLOUDINARY_CLOUD_NAME'),
      api_key:    this.config.get('CLOUDINARY_API_KEY'),
      api_secret: this.config.get('CLOUDINARY_API_SECRET'),
    });
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
  ): Promise<string> {
    if (!fs.existsSync(localPath)) {
      this.logger.warn(`Audio file not found, skipping upload: ${localPath}`);
      return null;
    }

    try {
      const result = await cloudinary.uploader.upload(localPath, {
        resource_type: 'video',        // Cloudinary treats audio as video type
        folder:        `undertone/${interviewId}/chunks`,
        public_id:     chunkId,
        overwrite:     true,
      });

      this.logger.debug(`Uploaded ${chunkId} → ${result.secure_url}`);
      return result.secure_url;
    } catch (error) {
      this.logger.error(`Failed to upload ${chunkId}: ${error.message}`);
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

    return urlMap;
  }
}