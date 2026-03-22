"use client";

import { useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

interface Speaker {
  id: string;
  label: string;
  color: string;
}

interface NavbarProps {
  title?: string;
  filename?: string;
  speakers?: Speaker[];
  colorMode?: "color" | "mono";
  onColorModeToggle?: () => void;
}

// ── Default data (swap with real props) ──────────────────────────────────────

const DEFAULT_SPEAKERS: Speaker[] = [
  { id: "speaker_a", label: "Speaker A", color: "#2563EB" },
  { id: "speaker_b", label: "Speaker B", color: "#D97706" },
  { id: "speaker_c", label: "Speaker C", color: "#059669" },
];

// ── Sub-components ───────────────────────────────────────────────────────────

function SpeakerPip({ color, mono }: { color: string; mono: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: mono ? "#9CA3AF" : color,
        flexShrink: 0,
        transition: "background 0.3s ease",
      }}
    />
  );
}

function SpeakerLegend({
  speakers,
  mono,
}: {
  speakers: Speaker[];
  mono: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      {speakers.map((s) => (
        <div
          key={s.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            fontWeight: 500,
            color: "#6B7280",
            letterSpacing: "0.01em",
          }}
        >
          <SpeakerPip color={s.color} mono={mono} />
          {s.label}
        </div>
      ))}
    </div>
  );
}

function ColorToggle({
  mono,
  onToggle,
}: {
  mono: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      title={mono ? "Switch to color mode" : "Switch to mono mode"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "5px 11px",
        borderRadius: 6,
        border: "1px solid #E5E7EB",
        background: mono ? "#F9FAFB" : "#FFFFFF",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 500,
        color: "#374151",
        letterSpacing: "0.01em",
        transition: "all 0.15s ease",
        fontFamily: "inherit",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = "#D1D5DB";
        (e.currentTarget as HTMLButtonElement).style.background = "#F3F4F6";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = "#E5E7EB";
        (e.currentTarget as HTMLButtonElement).style.background = mono
          ? "#F9FAFB"
          : "#FFFFFF";
      }}
    >
      {/* Swatch stack */}
      <span style={{ display: "flex", gap: 2 }}>
        {["#2563EB", "#D97706", "#059669"].map((c, i) => (
          <span
            key={i}
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: mono ? "#D1D5DB" : c,
              transition: "background 0.3s ease",
            }}
          />
        ))}
      </span>
      {mono ? "Colorize" : "Mono"}
    </button>
  );
}

// ── Main Navbar ──────────────────────────────────────────────────────────────

export default function Navbar({
  title = "Q4 Earnings Call",
  filename = "earnings_call_q4_2024.mp3",
  speakers = DEFAULT_SPEAKERS,
  colorMode,
  onColorModeToggle,
}: NavbarProps) {
  const [internalMono, setInternalMono] = useState(false);

  const isMono = colorMode !== undefined ? colorMode === "mono" : internalMono;
  const handleToggle =
    onColorModeToggle ?? (() => setInternalMono((v) => !v));

  return (
    <>
      {/* Font import — remove if you have it in layout.tsx already */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
      `}</style>

      <header
        style={{
          fontFamily: "'DM Sans', sans-serif",
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid #E9EAEC",
          boxShadow: "0 1px 0 0 rgba(0,0,0,0.04)",
        }}
      >
        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "0 24px",
            height: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          {/* Left — wordmark + divider + file name */}
          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
            {/* Wordmark */}
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            </div>

            {/* File title */}
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#111827",
                  letterSpacing: "-0.01em",
                  lineHeight: 1.2,
                }}
              >
                {title}
              </span>
              <span
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 10,
                  color: "#9CA3AF",
                  fontWeight: 400,
                  letterSpacing: "0.02em",
                  lineHeight: 1,
                }}
              >
                {filename}
              </span>
            </div>
          </div>

          {/* Right — speaker legend + color toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <SpeakerLegend speakers={speakers} mono={isMono} />

            {/* Hairline separator */}
            <span
              style={{
                display: "inline-block",
                width: 1,
                height: 16,
                background: "#E5E7EB",
              }}
            />

            <ColorToggle mono={isMono} onToggle={handleToggle} />
          </div>
        </div>
      </header>
    </>
  );
}