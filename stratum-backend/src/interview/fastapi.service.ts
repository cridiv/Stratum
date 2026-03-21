import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import FormData from 'form-data';
import axios from 'axios';
import * as fs from 'fs';

@Injectable()
export class FastApiService {
  private readonly logger = new Logger(FastApiService.name);
  private readonly baseUrl: string;

  constructor(private config: ConfigService) {
    this.baseUrl = this.config.get('FASTAPI_URL') || 'http://localhost:8000';
  }

  /**
   * Send uploaded file to FastAPI /analyze endpoint.
   * Returns the full pipeline output — chunks, audit, utterances, scores.
   *
   * API keys are passed as query params so FastAPI can
   * forward them to AssemblyAI and Hume.
   */
  async analyze(
    filePath:         string,
    filename:         string,
    groundTruthPath?: string,
  ): Promise<any> {
    const assemblyaiKey = this.config.get('ASSEMBLYAI_API_KEY');
    const humeKey       = this.config.get('HUME_API_KEY');

    this.logger.log(`Sending ${filename} to FastAPI for analysis...`);

    // Build multipart form with the audio file
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), filename);

    // Build query string
    const params: Record<string, string> = {
      assemblyai_key: assemblyaiKey,
      hume_key:       humeKey,
    };
    if (groundTruthPath) {
      params.ground_truth_path = groundTruthPath;
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/analyze`,
        form,
        {
          params,
          headers: form.getHeaders(),
          // Pipeline can take several minutes — set a generous timeout
          timeout: 600_000, // 10 minutes
          maxContentLength: Infinity,
          maxBodyLength:    Infinity,
        }
      );

      this.logger.log(`FastAPI analysis complete for ${filename}`);
      return response.data;

    } catch (error) {
      const message = error.response?.data?.detail || error.message;
      this.logger.error(`FastAPI call failed: ${message}`);
      throw new HttpException(
        `Pipeline failed: ${message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}