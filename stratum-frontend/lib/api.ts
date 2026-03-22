/**
 * API client for Stratum backend interviews
 */

const RAW_API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
const API_BASE = RAW_API_BASE.replace(/\/api\/?$/, "");

export interface InterviewData {
  id: string;
  interviewId: string;
  filename: string;
  duration: number;
  speakerCount: number;
  chunkCount: number;
  title?: string;
  formattedParagraphs?: string[];
  createdAt: string;
  audioUrl?: string;
  audit?: Record<string, unknown>;
  scores?: Record<string, unknown>;
  chunks?: ChunkRaw[];
}

export interface ChunkRaw {
  id: string;
  chunkIndex: number;
  chunkId: string;
  transcriptText: string | null;
  sentiment?: Record<string, unknown>;
  speakerId: string | null;
  speakerConfidence: number | null;
  startTime: number;
  endTime: number;
  duration: number;
  acoustic?: Record<string, unknown>;
  emotion?: Record<string, number>;
  hesitationDetected?: boolean;
  energyDrop?: boolean;
  pitchInstability?: boolean;
  crosstalkDetected?: boolean;
  audioUrl?: string;
}

export interface AnalyzeInterviewResponse {
  interviewId: string;
  chunkCount: number;
  speakerCount: number;
  duration: number;
  audit?: Record<string, unknown>;
  scores?: Record<string, unknown> | null;
}

/**
 * List all interviews
 */
export async function listInterviews() {
  const res = await fetch(`${API_BASE}/interviews`);
  // Treat missing collection endpoints or no-content as an empty records state.
  if (res.status === 404 || res.status === 204) {
    return [] as InterviewData[];
  }
  if (!res.ok) throw new Error(`Failed to list interviews: ${res.statusText}`);
  return res.json() as Promise<InterviewData[]>;
}

/**
 * Upload and analyze an interview audio file
 */
export async function analyzeInterview(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/interviews/analyze`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) throw new Error(`Failed to analyze interview: ${res.statusText}`);
  return res.json() as Promise<AnalyzeInterviewResponse>;
}

/**
 * Get a single interview with all chunks
 */
export async function getInterview(interviewId: string) {
  const res = await fetch(`${API_BASE}/interviews/${interviewId}`);
  if (!res.ok) throw new Error(`Failed to fetch interview: ${res.statusText}`);
  return res.json() as Promise<InterviewData>;
}

/**
 * Get paginated chunks for an interview
 */
export async function getInterviewChunks(
  interviewId: string,
  skip = 0,
  take = 20
) {
  const res = await fetch(
    `${API_BASE}/interviews/${interviewId}/chunks?skip=${skip}&take=${take}`
  );
  if (!res.ok) throw new Error(`Failed to fetch chunks: ${res.statusText}`);
  return res.json() as Promise<ChunkRaw[]>;
}

/**
 * Get audit findings for an interview
 */
export async function getInterviewAudit(interviewId: string) {
  const res = await fetch(`${API_BASE}/interviews/${interviewId}/audit`);
  if (!res.ok) throw new Error(`Failed to fetch audit: ${res.statusText}`);
  return res.json() as Promise<{ audit: Record<string, unknown>; scores: Record<string, unknown> }>;
}

/**
 * Format transcript into paragraphs and save to database
 */
export async function formatTranscript(interviewId: string) {
  const res = await fetch(`${API_BASE}/interviews/${interviewId}/format-transcript`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Failed to format transcript: ${res.statusText}`);
  return res.json() as Promise<{
    interviewId: string;
    title: string;
    paragraphCount: number;
    paragraphs: string[];
  }>;
}
