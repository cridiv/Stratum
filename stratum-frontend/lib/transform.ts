/**
 * Transform backend data to frontend interfaces
 */

import type { ChunkRaw } from "./api";
import type { Speaker, Chunk, Emotion } from "@/app/transcript/Transcript";

const SPEAKER_COLORS = ["#2563EB", "#D97706", "#059669", "#7C3AED", "#DC2626"];

function pickNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function pickObjectNumber(
  obj: Record<string, unknown> | undefined,
  keys: string[],
  fallback = 0
): number {
  if (!obj) return fallback;

  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return fallback;
}

/**
 * Build speaker list from chunk data
 */
export function buildSpeakersFromChunks(chunks: ChunkRaw[]): Speaker[] {
  const speakerMap = new Map<string, Speaker>();
  const colorIndex = new Map<string, number>();

  chunks.forEach((chunk) => {
    if (chunk.speakerId && !speakerMap.has(chunk.speakerId)) {
      const idx = colorIndex.size % SPEAKER_COLORS.length;
      colorIndex.set(chunk.speakerId, idx);
      speakerMap.set(chunk.speakerId, {
        id: chunk.speakerId,
        label: `Speaker ${String.fromCharCode(65 + idx)}`,
        color: SPEAKER_COLORS[idx],
      });
    }
  });

  return Array.from(speakerMap.values());
}

/**
 * Format seconds to HH:MM:SS
 */
function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Transform backend chunk to frontend Chunk
 */
export function transformChunk(raw: ChunkRaw): Chunk {
  // Extract emotions from acoustic data or emotion field
  const emotions: Emotion[] = [];
  if (raw.emotion && typeof raw.emotion === "object") {
    Object.entries(raw.emotion).forEach(([label, value]) => {
      if (typeof value === "number") {
        emotions.push({ label, value });
      }
    });
  }

  const acoustic = (raw.acoustic && typeof raw.acoustic === "object"
    ? (raw.acoustic as Record<string, unknown>)
    : undefined);

  const energyObj = (acoustic?.energy && typeof acoustic.energy === "object"
    ? (acoustic.energy as Record<string, unknown>)
    : undefined);

  const pitchObj = (acoustic?.pitch && typeof acoustic.pitch === "object"
    ? (acoustic.pitch as Record<string, unknown>)
    : undefined);

  const silenceObj = (acoustic?.silence && typeof acoustic.silence === "object"
    ? (acoustic.silence as Record<string, unknown>)
    : undefined);

  const energy = pickObjectNumber(energyObj, ["normalized", "rms", "peak"], 0);
  const pitch = pickObjectNumber(pitchObj, ["mean_hz", "variance", "max_hz", "min_hz"], 0);
  const pauses = pickObjectNumber(silenceObj, ["pause_count"], 0);

  return {
    id: raw.chunkId,
    speaker: raw.speakerId || "unknown",
    start: formatTime(raw.startTime),
    end: formatTime(raw.endTime),
    text: raw.transcriptText || "",
    confidence: pickNumber(raw.speakerConfidence, 0),
    energy,
    pitch,
    pauses,
    emotions,
  };
}
