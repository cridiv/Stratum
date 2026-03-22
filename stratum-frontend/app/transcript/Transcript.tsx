"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import NavBar from "./components/NavBar";
import { getInterview, formatTranscript } from "@/lib/api";
import { buildSpeakersFromChunks, transformChunk } from "@/lib/transform";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Speaker {
  id: string;
  label: string;
  color: string;
}

export interface Emotion {
  label: string;
  value: number;
}

export interface Chunk {
  id: string;
  speaker: string;
  start: string;
  end: string;
  text: string;
  confidence: number;
  energy: number;
  pitch: number;
  pauses: number;
  emotions: Emotion[];
}

interface TranscriptPageProps {
  interviewId: string;
}

// ── Mock Data ────────────────────────────────────────────────────────────────

const DEFAULT_INTERVIEW_ID = "interview_001";

const DEMO_CHUNKS: Chunk[] = [
  {
    id: "chunk_001", speaker: "speaker_a", start: "00:00:03", end: "00:00:18",
    text: "Good morning everyone, and welcome to TechVenture's Q4 earnings call. Q4 was a milestone quarter for us — we crossed the $200 million ARR threshold for the first time in company history.",
    confidence: 0.97, energy: 0.42, pitch: 187, pauses: 1,
    emotions: [{ label: "confidence", value: 0.81 }, { label: "excitement", value: 0.64 }, { label: "uncertainty", value: 0.09 }],
  },
  {
    id: "chunk_002", speaker: "speaker_b", start: "00:00:19", end: "00:00:41",
    text: "Thank you Sarah. Turning to the numbers — our EBITDA margins expanded to 23.4%, up from 18.1% in Q3. We saw particularly strong performance in the enterprise segment, which now accounts for 61% of total revenue.",
    confidence: 0.94, energy: 0.38, pitch: 143, pauses: 2,
    emotions: [{ label: "confidence", value: 0.76 }, { label: "uncertainty", value: 0.21 }, { label: "enthusiasm", value: 0.48 }],
  },
  {
    id: "chunk_003", speaker: "speaker_a", start: "00:00:42", end: "00:01:02",
    text: "On the product side, we shipped 14 major features this quarter. Our new AI assistant integration saw 40,000 activations within the first week — well ahead of our internal projections. Customer NPS hit an all-time high of 72.",
    confidence: 0.96, energy: 0.51, pitch: 192, pauses: 2,
    emotions: [{ label: "excitement", value: 0.78 }, { label: "confidence", value: 0.84 }, { label: "uncertainty", value: 0.06 }],
  },
  {
    id: "chunk_004", speaker: "speaker_c", start: "00:01:03", end: "00:01:29",
    text: "From a pipeline perspective, we're entering Q1 with $48 million in qualified opportunities — a 34% increase year-over-year. However, I do want to flag that macro headwinds in EMEA may create some conversion delays in the first half.",
    confidence: 0.91, energy: 0.31, pitch: 158, pauses: 3,
    emotions: [{ label: "uncertainty", value: 0.61 }, { label: "caution", value: 0.54 }, { label: "confidence", value: 0.42 }],
  },
  {
    id: "chunk_005", speaker: "speaker_b", start: "00:01:30", end: "00:01:51",
    text: "To address that — we've already taken steps to diversify our go-to-market motion. We're doubling down on the North American mid-market, and our channel partner program launched in APAC last month with 12 signed resellers.",
    confidence: 0.95, energy: 0.44, pitch: 148, pauses: 1,
    emotions: [{ label: "confidence", value: 0.79 }, { label: "enthusiasm", value: 0.55 }, { label: "uncertainty", value: 0.14 }],
  },
  {
    id: "chunk_006", speaker: "speaker_a", start: "00:01:52", end: "00:02:10",
    text: "We'll now open the floor to questions. I'd ask that everyone keep their questions concise so we can get through as many as possible in the time allotted. Operator, please go ahead.",
    confidence: 0.98, energy: 0.35, pitch: 179, pauses: 2,
    emotions: [{ label: "confidence", value: 0.88 }, { label: "uncertainty", value: 0.04 }, { label: "caution", value: 0.18 }],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function getSpeaker(id: string, list: Speaker[]): Speaker {
  return list.find((s) => s.id === id) ?? list[0];
}

function formatPlaybackTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "0:00";
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function parseTimecodeToSeconds(v: string): number {
  const parts = v.split(":").map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] ?? 0;
}

// ── WordAnnotatedChunk ────────────────────────────────────────────────────────
// Renders one chunk's text as individually-clickable word spans.
// Clicking any word calls onWordClick(chunk) — the paragraph structure above
// stays intact; only the specific chunk's metadata surfaces in the panel.

function WordAnnotatedChunk({
  chunk,
  isActive,
  mono,
  speaker,
  onWordClick,
}: {
  chunk: Chunk;
  isActive: boolean;
  mono: boolean;
  speaker: Speaker;
  onWordClick: (chunk: Chunk) => void;
}) {
  // Split on whitespace, preserving the whitespace tokens so spacing is exact
  const tokens = chunk.text.split(/(\s+)/);

  return (
    <>
      {tokens.map((token, i) => {
        if (/^\s+$/.test(token)) return <span key={i}>{token}</span>;

        return (
          <span
            key={i}
            onClick={(e) => { e.stopPropagation(); onWordClick(chunk); }}
            style={{
              borderRadius: 2,
              padding: "1px 0",
              cursor: "pointer",
              // Active words get a tinted background in the speaker's color
              background: isActive
                ? mono ? "rgba(55,65,81,0.10)" : `${speaker.color}1f`
                : "transparent",
              color: isActive
                ? mono ? "#FFFFFF" : speaker.color
                : "inherit",
              transition: "background 0.12s, color 0.12s",
            }}
            onMouseEnter={(e) => {
              if (!isActive)
                (e.currentTarget as HTMLSpanElement).style.background = "rgba(0,0,0,0.055)";
            }}
            onMouseLeave={(e) => {
              if (!isActive)
                (e.currentTarget as HTMLSpanElement).style.background = "transparent";
            }}
          >
            {token}
          </span>
        );
      })}
    </>
  );
}

// ── Metadata Panel ────────────────────────────────────────────────────────────

function EmotionBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  const color = value > 0.7 ? "#2563EB" : value > 0.45 ? "#D97706" : "#9CA3AF";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#D1D5DB", fontWeight: 500 }}>
        <span>{label}</span>
        <span style={{ fontFamily: "'DM Mono', monospace", color: "#FFFFFF" }}>{value.toFixed(2)}</span>
      </div>
      <div style={{ height: 4, borderRadius: 99, background: "#2A2A2A", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: color, transition: "width 0.4s cubic-bezier(0.22,1,0.36,1)" }} />
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #2A2A2A" }}>
      <span style={{ fontSize: 11, color: "#D1D5DB", fontWeight: 500, letterSpacing: "0.03em", textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#FFFFFF", fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function MetadataPanel({
  chunk,
  speakers,
  onClose,
  onPlayChunk,
  canPlayChunk,
}: {
  chunk: Chunk;
  speakers: Speaker[];
  onClose: () => void;
  onPlayChunk: (c: Chunk) => void;
  canPlayChunk: boolean;
}) {
  const speaker = getSpeaker(chunk.speaker, speakers);
  return (
    <aside style={{ width: 280, flexShrink: 0, borderLeft: "1px solid #2A2A2A", background: "#111111", display: "flex", flexDirection: "column", overflowY: "auto", animation: "slideIn 0.22s cubic-bezier(0.22,1,0.36,1)" }}>
      <style>{`@keyframes slideIn { from { opacity:0; transform:translateX(16px); } to { opacity:1; transform:translateX(0); } }`}</style>

      {/* Header */}
      <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid #2A2A2A", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "#111111", zIndex: 1 }}>
        <div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#D1D5DB", letterSpacing: "0.04em" }}>{chunk.id}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#FFFFFF", display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: speaker.color, display: "inline-block" }} />
            {speaker.label}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid #2A2A2A", background: "#1A1A1A", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#D1D5DB", transition: "all 0.15s" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#2A2A2A"; (e.currentTarget as HTMLButtonElement).style.color = "#FFFFFF"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#1A1A1A"; (e.currentTarget as HTMLButtonElement).style.color = "#D1D5DB"; }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Chunk text preview */}
      <div style={{ padding: "12px 16px 4px" }}>
        <p style={{
          margin: 0,
          fontSize: 12,
          lineHeight: 1.65,
          color: "#D1D5DB",
          fontStyle: "italic",
          borderLeft: `3px solid ${speaker.color}`,
          paddingLeft: 10,
        }}>
          "{chunk.text.length > 120 ? chunk.text.slice(0, 120) + "…" : chunk.text}"
        </p>
      </div>

      {/* Meta rows */}
      <div style={{ padding: "4px 16px 16px" }}>
        <MetaRow label="Start"      value={chunk.start} />
        <MetaRow label="End"        value={chunk.end} />
        <MetaRow label="Confidence" value={chunk.confidence} />
        <MetaRow label="Energy"     value={chunk.energy} />
        <MetaRow label="Pitch"      value={`${chunk.pitch} hz`} />
        <MetaRow label="Pauses"     value={chunk.pauses} />
      </div>

      {/* Emotions */}
      <div style={{ padding: "12px 16px 16px", borderTop: "1px solid #2A2A2A", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#D1D5DB", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>Emotion Analysis</div>
        {chunk.emotions.map((e) => <EmotionBar key={e.label} label={e.label} value={e.value} />)}
      </div>

      {/* Play chunk */}
      <div style={{ padding: "0 16px 20px", marginTop: "auto" }}>
        <button
          onClick={() => onPlayChunk(chunk)}
          disabled={!canPlayChunk}
          style={{ width: "100%", padding: "9px 14px", borderRadius: 8, border: "1px solid #2A2A2A", background: canPlayChunk ? "#1A1A1A" : "#2A2A2A", cursor: canPlayChunk ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 600, color: canPlayChunk ? "#FFFFFF" : "#9CA3AF", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, transition: "all 0.15s", fontFamily: "'DM Sans', sans-serif" }}
          onMouseEnter={(e) => { if (!canPlayChunk) return; (e.currentTarget as HTMLButtonElement).style.background = "#E8B96A"; (e.currentTarget as HTMLButtonElement).style.color = "#111111"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#E8B96A"; }}
          onMouseLeave={(e) => { if (!canPlayChunk) return; (e.currentTarget as HTMLButtonElement).style.background = "#1A1A1A"; (e.currentTarget as HTMLButtonElement).style.color = "#FFFFFF"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#2A2A2A"; }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
          Play chunk
        </button>
      </div>
    </aside>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TranscriptPage({ interviewId }: TranscriptPageProps) {
  const audioRef    = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);

  const [activeChunk,          setActiveChunk]          = useState<Chunk | null>(null);
  const [mono,                 setMono]                 = useState(false);
  const [speakers,             setSpeakers]             = useState<Speaker[]>([]);
  const [chunks,               setChunks]               = useState<Chunk[]>([]);
  const [title,                setTitle]                = useState("Interview Transcript");
  const [filename,             setFilename]             = useState("audio-file");
  const [audioUrl,             setAudioUrl]             = useState<string | null>(null);
  const [isPlaying,            setIsPlaying]            = useState(false);
  const [playbackRate,         setPlaybackRate]         = useState(1);
  const [currentTime,          setCurrentTime]          = useState(0);
  const [duration,             setDuration]             = useState(0);
  const [loading,              setLoading]              = useState(true);
  const [formattedParagraphs,  setFormattedParagraphs]  = useState<string[] | null>(null);
  const [formattingTranscript, setFormattingTranscript] = useState(false);

  const chunkMap = useMemo(
    () => new Map(chunks.map((c) => [c.id, c])),
    [chunks],
  );

  // Build grouped paragraphs from formatted paragraph strings
  const groupedParagraphs = useMemo(() => {
    if (!formattedParagraphs || formattedParagraphs.length === 0) {
      return chunks.map((c) => [c]);
    }

    // Reconstruct which chunks belong to each formatted paragraph
    // by matching paragraph text to chunk text
    const allChunkText = chunks.map((c) => c.text.trim());
    const grouped: Chunk[][] = [];

    for (const paragraph of formattedParagraphs) {
      const paragraphChunks: Chunk[] = [];
      let remainingText = paragraph;

      for (const chunkText of allChunkText) {
        if (remainingText.includes(chunkText)) {
          const chunk = chunks.find((c) => c.text.trim() === chunkText);
          if (chunk && !paragraphChunks.includes(chunk)) {
            paragraphChunks.push(chunk);
            remainingText = remainingText.replace(chunkText, "").trim();
          }
        }
      }

      if (paragraphChunks.length > 0) {
        grouped.push(paragraphChunks);
      }
    }

    return grouped.length > 0 ? grouped : chunks.map((c) => [c]);
  }, [formattedParagraphs, chunks]);

  // Load interview
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await getInterview(interviewId || DEFAULT_INTERVIEW_ID);
        setTitle(data.title || data.interviewId || "Interview Transcript");
        setFilename(data.filename || "audio-file");
        setAudioUrl(data.audioUrl || null);
        setCurrentTime(0);
        setDuration(Number.isFinite(data.duration) ? data.duration : 0);
        setIsPlaying(false);
        setPlaybackRate(1);

        if (data.chunks) {
          setChunks(data.chunks.map(transformChunk));
          setSpeakers(buildSpeakersFromChunks(data.chunks));

          // Load formatted paragraphs if available
          if (data.formattedParagraphs && data.formattedParagraphs.length > 0) {
            setFormattedParagraphs(data.formattedParagraphs);
          } else {
            // Trigger formatting on backend if not already formatted
            setFormattingTranscript(true);
            try {
              const formatResult = await formatTranscript(data.interviewId);
              setFormattedParagraphs(formatResult.paragraphs);
              // Update title with generated title from OpenAI
              if (formatResult.title) {
                setTitle(formatResult.title);
              }
            } catch (err) {
              console.error("Failed to format transcript:", err);
              // Fallback: treat each chunk as its own paragraph
              const chunkTexts = data.chunks.map((c: any) => c.transcriptText || "");
              setFormattedParagraphs(chunkTexts);
            } finally {
              setFormattingTranscript(false);
            }
          }
        } else {
          applyFallback();
        }
      } catch {
        applyFallback();
      } finally {
        setLoading(false);
      }
    }

    function applyFallback() {
      setChunks(DEMO_CHUNKS);
      setFormattedParagraphs(null);
      setAudioUrl(null);
      setDuration(130);
      setSpeakers([
        { id: "speaker_a", label: "Sarah K.",  color: "#2563EB" },
        { id: "speaker_b", label: "Marcus T.", color: "#D97706" },
        { id: "speaker_c", label: "James L.",  color: "#059669" },
      ]);
    }

    load();
  }, [interviewId]);

  // ── Playback handlers ─────────────────────────────────────────────────────

  const handleWordClick = (chunk: Chunk) => {
    setActiveChunk((prev) => (prev?.id === chunk.id ? null : chunk));
  };

  const handleTogglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (audio.paused) { try { await audio.play(); } catch (e) { console.error(e); } }
    else audio.pause();
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const bar   = progressRef.current;
    if (!audio || !bar || duration <= 0) return;
    const rect  = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrentTime(audio.currentTime);
  };

  const handleSpeedToggle = () => {
    const next = playbackRate === 1 ? 1.25 : playbackRate === 1.25 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const handlePlayChunk = async (chunk: Chunk) => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    audio.currentTime = Math.max(0, parseTimecodeToSeconds(chunk.start));
    setCurrentTime(audio.currentTime);
    try { await audio.play(); } catch (e) { console.error(e); }
  };

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontSize: 13, color: "#D1D5DB", fontFamily: "'DM Mono', monospace", background: "#000000" }}>
        Loading interview…
      </div>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: #000000; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ fontFamily: "'DM Sans', sans-serif", display: "flex", flexDirection: "column", height: "100vh", background: "#000000" }}>
        <audio
          ref={audioRef}
          src={audioUrl ?? undefined}
          preload="metadata"
          onLoadedMetadata={() => {
            const m = audioRef.current;
            if (!m) return;
            if (Number.isFinite(m.duration) && m.duration > 0) setDuration(m.duration);
            m.playbackRate = playbackRate;
          }}
          onTimeUpdate={() => { const m = audioRef.current; if (m) setCurrentTime(m.currentTime || 0); }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
        />

        <NavBar
          title={title}
          filename={filename}
          speakers={speakers}
          colorMode={mono ? "mono" : "color"}
          onColorModeToggle={() => setMono((v) => !v)}
        />

        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <main style={{ flex: 1, overflowY: "auto" }}>

            {/* ── Audio player bar ─────────────────────────────────────── */}
            <div style={{ padding: "12px 24px", borderBottom: "1px solid #2A2A2A", background: "#111111", display: "flex", alignItems: "center", gap: 14, position: "sticky", top: 0, zIndex: 10 }}>
              <button
                onClick={handleTogglePlay}
                disabled={!audioUrl}
                style={{ width: 34, height: 34, borderRadius: 8, background: audioUrl ? "#E8B96A" : "#5A5A5A", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: audioUrl ? "pointer" : "not-allowed", color: audioUrl ? "#111111" : "#F3F4F6", flexShrink: 0, transition: "opacity 0.15s" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = "0.8")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = "1")}
              >
                {isPlaying
                  ? <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                  : <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
                }
              </button>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#E5E7EB", flexShrink: 0 }}>
                {formatPlaybackTime(currentTime)} / {formatPlaybackTime(duration)}
              </span>
              <div ref={progressRef} onClick={handleSeek} style={{ flex: 1, position: "relative", height: 28, cursor: audioUrl ? "pointer" : "default" }}>
                <div style={{ position: "absolute", inset: "10px 0", borderRadius: 99, background: "#2A2A2A" }} />
                <div style={{ position: "absolute", top: 10, left: 0, width: `${progressPercent}%`, height: 8, borderRadius: 99, background: "#E8B96A" }} />
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", gap: 2, paddingInline: 2 }}>
                  {Array.from({ length: 80 }).map((_, i) => {
                    const h = 4 + Math.sin(i * 0.7) * 3 + Math.sin(i * 0.3) * 5;
                    return <div key={i} style={{ width: 2, height: Math.max(3, h), borderRadius: 2, background: ((i + 1) / 80) * 100 <= progressPercent ? "#E8B96A" : "#4B5563", flexShrink: 0 }} />;
                  })}
                </div>
              </div>
              <button onClick={handleSpeedToggle} disabled={!audioUrl} style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 600, padding: "4px 9px", borderRadius: 6, border: "1px solid #2A2A2A", background: "#1A1A1A", cursor: audioUrl ? "pointer" : "not-allowed", color: "#FFFFFF", flexShrink: 0 }}>
                {playbackRate}×
              </button>
            </div>

            {/* ── Document body ─────────────────────────────────────────── */}
            <div style={{ maxWidth: 680, margin: "0 auto", padding: "52px 40px 100px" }}>

              <h1 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 600, color: "#FFFFFF", letterSpacing: "-0.03em", lineHeight: 1.25 }}>{title}</h1>

              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 36, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#D1D5DB" }}>{filename}</span>
                <span style={{ width: 3, height: 3, borderRadius: "50%", background: "#D1D5DB", display: "inline-block" }} />
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#D1D5DB" }}>{formatPlaybackTime(duration)}</span>
                <span style={{ width: 3, height: 3, borderRadius: "50%", background: "#D1D5DB", display: "inline-block" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {speakers.map((s) => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: mono ? "#D1D5DB" : s.color, display: "inline-block", transition: "background 0.3s" }} />
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#D1D5DB" }}>{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ width: "100%", height: 1, background: "#2A2A2A", marginBottom: 36 }} />

              {/* Grouping loading spinner */}
              {formattingTranscript && chunks.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
                  <div style={{ width: 13, height: 13, borderRadius: "50%", border: "2px solid #2A2A2A", borderTopColor: "#E8B96A", animation: "spin 0.75s linear infinite" }} />
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#D1D5DB" }}>Formatting transcript…</span>
                </div>
              )}

              {/* ── Paragraphs ─────────────────────────────────────────── */}
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {groupedParagraphs.map((paragraphChunks, pi) => {
                  const paragraphHasActive = paragraphChunks.some((c) => c.id === activeChunk?.id);
                  const activeInPara = paragraphChunks.find((c) => c.id === activeChunk?.id);
                  const borderSpeaker = activeInPara
                    ? getSpeaker(activeInPara.speaker, speakers)
                    : getSpeaker(paragraphChunks[0].speaker, speakers);

                  return (
                    <p
                      key={`para-${pi}`}
                      style={{
                        margin: 0,
                        fontSize: 15.5,
                        lineHeight: 1.85,
                        color: "#FFFFFF",
                        fontWeight: 400,
                        padding: "6px 12px",
                        borderRadius: 6,
                        marginInline: -12,
                        // Paragraph gets a faint left border when it contains the active chunk
                        borderLeft: paragraphHasActive
                          ? `3px solid ${mono ? "#D1D5DB" : borderSpeaker.color}55`
                          : "3px solid transparent",
                        transition: "border-color 0.15s",
                        background: "transparent",
                      }}
                    >
                      {paragraphChunks.map((chunk, ci) => {
                        const speaker    = getSpeaker(chunk.speaker, speakers);
                        const isActive   = chunk.id === activeChunk?.id;
                        // Inter-chunk space: add if not already trailing
                        const needsSpace = ci < paragraphChunks.length - 1 && !chunk.text.endsWith(" ");

                        return (
                          <span key={chunk.id}>
                            {/*
                              WordAnnotatedChunk: every word in this chunk is a
                              clickable span. Clicking any word opens the metadata
                              for *this specific chunk*, not the whole paragraph.
                            */}
                            <WordAnnotatedChunk
                              chunk={chunk}
                              isActive={isActive}
                              mono={mono}
                              speaker={speaker}
                              onWordClick={handleWordClick}
                            />
                            {needsSpace && " "}
                          </span>
                        );
                      })}
                    </p>
                  );
                })}
              </div>
            </div>
          </main>

          {/* ── Right metadata panel ──────────────────────────────────── */}
          {activeChunk && (
            <MetadataPanel
              chunk={activeChunk}
              speakers={speakers}
              onClose={() => setActiveChunk(null)}
              onPlayChunk={handlePlayChunk}
              canPlayChunk={Boolean(audioUrl)}
            />
          )}
        </div>
      </div>
    </>
  );
}