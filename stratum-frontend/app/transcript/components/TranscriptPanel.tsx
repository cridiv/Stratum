"use client";

import { useState } from "react";
import { Chunk, Speaker } from "./types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getSpeaker(id: string, speakers: Speaker[]): Speaker {
  return speakers.find((s) => s.id === id) ?? speakers[0];
}

// ── Chunk Row ────────────────────────────────────────────────────────────────

function ChunkRow({
  chunk,
  speakers,
  isActive,
  mono,
  onClick,
}: {
  chunk: Chunk;
  speakers: Speaker[];
  isActive: boolean;
  mono: boolean;
  onClick: () => void;
}) {
  const speaker = getSpeaker(chunk.speaker, speakers);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        gap: 14,
        padding: "14px 24px",
        cursor: "pointer",
        background: isActive ? "#1F2937" : hovered ? "#1A1A1A" : "transparent",
        borderLeft: `3px solid ${
          isActive ? (mono ? "#E5E7EB" : speaker.color) : "transparent"
        }`,
        transition: "all 0.15s ease",
      }}
    >
      {/* Timestamp + speaker pip */}
      <div
        style={{
          flexShrink: 0,
          width: 64,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 5,
          paddingTop: 2,
        }}
      >
        <span
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 10,
            color: "#D1D5DB",
            letterSpacing: "0.03em",
          }}
        >
          {chunk.start}
        </span>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: mono ? "#D1D5DB" : speaker.color,
            display: "inline-block",
            transition: "background 0.3s",
          }}
        />
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: mono ? "#E5E7EB" : speaker.color,
            marginBottom: 5,
            letterSpacing: "0.01em",
            transition: "color 0.3s",
          }}
        >
          {speaker.label}
        </div>
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.65,
            color: "#FFFFFF",
            margin: 0,
            fontWeight: 400,
          }}
        >
          {chunk.text}
        </p>
      </div>

      {/* Confidence pill */}
      <div style={{ flexShrink: 0, paddingTop: 2 }}>
        <span
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 10,
            fontWeight: 500,
            color:
              chunk.confidence > 0.95
                ? "#059669"
                : chunk.confidence > 0.9
                ? "#D97706"
                : "#EF4444",
            background:
              chunk.confidence > 0.95
                ? "#ECFDF5"
                : chunk.confidence > 0.9
                ? "#FFFBEB"
                : "#FEF2F2",
            padding: "3px 7px",
            borderRadius: 5,
            border: `1px solid ${
              chunk.confidence > 0.95
                ? "#A7F3D0"
                : chunk.confidence > 0.9
                ? "#FDE68A"
                : "#FECACA"
            }`,
          }}
        >
          {chunk.confidence.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

// ── TranscriptPanel ──────────────────────────────────────────────────────────

interface TranscriptPanelProps {
  chunks: Chunk[];
  speakers: Speaker[];
  activeChunkId: string | null;
  mono: boolean;
  onChunkClick: (chunk: Chunk) => void;
}

export default function TranscriptPanel({
  chunks,
  speakers,
  activeChunkId,
  mono,
  onChunkClick,
}: TranscriptPanelProps) {
  return (
    <main
      style={{
        flex: 1,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Audio player bar ─────────────────────────────────────────────── */}
      <div
        style={{
          padding: "12px 24px",
          borderBottom: "1px solid #2A2A2A",
          background: "#111111",
          display: "flex",
          alignItems: "center",
          gap: 14,
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        {/* Play/pause */}
        <button
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            background: "#E8B96A",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "#111111",
            flexShrink: 0,
            transition: "opacity 0.15s",
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.opacity = "0.8")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.opacity = "1")
          }
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5,3 19,12 5,21" />
          </svg>
        </button>

        {/* Time */}
        <span
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 11,
            color: "#E5E7EB",
            flexShrink: 0,
          }}
        >
          0:00 / 2:10
        </span>

        {/* Waveform / progress bar */}
        <div
          style={{
            flex: 1,
            position: "relative",
            height: 28,
            cursor: "pointer",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: "10px 0",
              borderRadius: 99,
              background: "#2A2A2A",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 10,
              left: 0,
              width: "22%",
              height: 8,
              borderRadius: 99,
              background: "#E8B96A",
              transition: "width 0.2s",
            }}
          />
          {/* Waveform notches */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              gap: 2,
              paddingInline: 2,
            }}
          >
            {Array.from({ length: 80 }).map((_, i) => {
              const h = 4 + Math.sin(i * 0.7) * 3 + Math.sin(i * 0.3) * 5;
              return (
                <div
                  key={i}
                  style={{
                    width: 2,
                    height: Math.max(3, h),
                    borderRadius: 2,
                    background: i < 18 ? "#E8B96A" : "#4B5563",
                    flexShrink: 0,
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Speed pill */}
        <button
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 11,
            fontWeight: 600,
            padding: "4px 9px",
            borderRadius: 6,
            border: "1px solid #2A2A2A",
            background: "#1A1A1A",
            cursor: "pointer",
            color: "#FFFFFF",
            flexShrink: 0,
          }}
        >
          1×
        </button>
      </div>

      {/* ── Chunk list ───────────────────────────────────────────────────── */}
      <div style={{ paddingBlock: 8 }}>
        {chunks.map((chunk) => (
          <ChunkRow
            key={chunk.id}
            chunk={chunk}
            speakers={speakers}
            isActive={activeChunkId === chunk.id}
            mono={mono}
            onClick={() => onChunkClick(chunk)}
          />
        ))}
      </div>
    </main>
  );
}