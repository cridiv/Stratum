"use client";

import { useEffect, useState } from "react";
import { listInterviews } from "@/lib/api";
import type { InterviewData } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────

interface StatCard {
  label: string;
  value: string;
  sub: string;
  trend?: "up" | "down" | "neutral";
}

interface DisplayInterview extends InterviewData {
  status: "done" | "failed";
  displayDate: string;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function TrendArrow({ trend }: { trend: "up" | "down" | "neutral" }) {
  if (trend === "neutral") return null;
  const up = trend === "up";
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      style={{ color: up ? "#059669" : "#EF4444", flexShrink: 0 }}
    >
      <path
        d={up ? "M6 9V3M3 6l3-3 3 3" : "M6 3v6M3 6l3 3 3-3"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatusBadge({ status }: { status: DisplayInterview["status"] }) {
  const map = {
    done: { label: "Done", color: "#059669", bg: "#ECFDF5", border: "#A7F3D0" },
    failed: {
      label: "Failed",
      color: "#EF4444",
      bg: "#FEF2F2",
      border: "#FECACA",
    },
  };
  const s = map[status];
  return (
    <span
      style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: 10,
        fontWeight: 500,
        color: s.color,
        background: s.bg,
        border: `1px solid ${s.border}`,
        padding: "2px 7px",
        borderRadius: 5,
      }}
    >
      {s.label}
    </span>
  );
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const isToday = d.toDateString() === today.toDateString();
  const isYesterday = d.toDateString() === yesterday.toDateString();

  if (isToday) return "Today";
  if (isYesterday) return "Yesterday";

  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  };
  return d.toLocaleDateString("en-US", options);
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [interviews, setInterviews] = useState<DisplayInterview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const data = await listInterviews();
        const displayed = data.map((i) => ({
          ...i,
          status: "done" as const,
          displayDate: formatDate(i.createdAt),
        }));
        setInterviews(displayed);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load interviews";
        setError(message);
        console.error("Dashboard load error:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // Calculate stats from interviews
  const stats: StatCard[] = [
    {
      label: "Total Transcripts",
      value: interviews.length.toString(),
      sub: `${interviews.length} uploaded`,
      trend: "neutral",
    },
    {
      label: "Audio Processed",
      value: formatDuration(
        interviews.reduce((sum, i) => sum + (i.duration || 0), 0)
      ),
      sub: `${interviews.reduce((sum, i) => sum + (i.chunkCount || 0), 0)} segments total`,
      trend: "neutral",
    },
    {
      label: "Unique Speakers",
      value: `${new Set(interviews.flatMap((i) => Array(i.speakerCount || 0).fill(0))).size}`,
      sub: "across all files",
      trend: "neutral",
    },
    {
      label: "Success Rate",
      value: interviews.length > 0 ? "100%" : "—",
      sub: "all processed successfully",
      trend: "neutral",
    },
  ];

  const LoadingState = () => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 400,
        color: "#E5E7EB",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            border: "3px solid #E9EAEC",
            borderTopColor: "#6B7280",
            animation: "spin 0.75s linear infinite",
          }}
        />
        <span style={{ fontSize: 13, fontFamily: "'DM Mono', monospace" }}>
          Loading interviews…
        </span>
      </div>
    </div>
  );

  const ErrorState = ({ message }: { message: string }) => (
    <div
      style={{
        background: "#FEF2F2",
        border: "1px solid #FECACA",
        borderRadius: 10,
        padding: "16px 20px",
        marginBottom: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#EF4444"
          strokeWidth="2"
          style={{ flexShrink: 0, marginTop: 1 }}
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#EF4444",
            }}
          >
            Error loading interviews
          </div>
          <div style={{ fontSize: 12, color: "#DC2626", marginTop: 4 }}>
            {message}
          </div>
        </div>
      </div>
    </div>
  );

  const EmptyState = () => (
    <div
      style={{
        background: "#111111",
        border: "1px solid #2A2A2A",
        borderRadius: 10,
        padding: "40px 20px",
        textAlign: "center",
      }}
    >
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#9CA3AF"
        strokeWidth="1.5"
        style={{ marginInline: "auto", marginBottom: 12 }}
      >
        <path d="M12 2a10 10 0 110 20 10 10 0 010-20z" />
        <path d="M12 9v6M9 12h6" />
      </svg>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "#FFFFFF",
        }}
      >
        No interviews yet
      </div>
      <div style={{ fontSize: 12, color: "#D1D5DB", marginTop: 4 }}>
        Upload an audio file to get started
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: #000000; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
      `}</style>

      <div
        style={{
          fontFamily: "'DM Sans', sans-serif",
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
          background: "#000000",
        }}
      >
        <main
          style={{
            flex: 1,
            maxWidth: 1100,
            margin: "0 auto",
            width: "100%",
            padding: "40px 32px 80px",
          }}
        >
          {/* ── Page heading ──────────────────────────────────────────────── */}
          <div style={{ marginBottom: 32 }}>
            <h1
              style={{
                margin: "0 0 4px",
                fontSize: 20,
                fontWeight: 600,
                color: "#FFFFFF",
                letterSpacing: "-0.03em",
              }}
            >
              Dashboard
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: "#D1D5DB" }}>
              Overview of your transcription activity
            </p>
          </div>

          {/* ── Error banner ──────────────────────────────────────────────── */}
          {error && <ErrorState message={error} />}

          {/* ── Loading state ─────────────────────────────────────────────── */}
          {loading ? (
            <LoadingState />
          ) : (
            <>
              {/* ── Stat cards ────────────────────────────────────────────────── */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 14,
                  marginBottom: 36,
                }}
              >
                {stats.map((s, i) => (
                  <div
                    key={s.label}
                    style={{
                      background: "#111111",
                      border: "1px solid #2A2A2A",
                      borderRadius: 10,
                      padding: "18px 20px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      animation: `fadeUp 0.3s ease ${i * 0.06}s both`,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: "#D1D5DB",
                        letterSpacing: "0.03em",
                        textTransform: "uppercase",
                      }}
                    >
                      {s.label}
                    </span>
                    <span
                      style={{
                        fontSize: 26,
                        fontWeight: 600,
                        color: "#FFFFFF",
                        letterSpacing: "-0.04em",
                        lineHeight: 1,
                      }}
                    >
                      {s.value}
                    </span>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      {s.trend && s.trend !== "neutral" && (
                        <TrendArrow trend={s.trend} />
                      )}
                      <span
                        style={{
                          fontSize: 11,
                          color:
                            s.trend === "up"
                              ? "#059669"
                              : s.trend === "down"
                                ? "#EF4444"
                                : "#D1D5DB",
                          fontFamily: "'DM Mono', monospace",
                        }}
                      >
                        {s.sub}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Interviews table ──────────────────────────────────────────── */}
              {interviews.length === 0 ? (
                <EmptyState />
              ) : (
                <div
                  style={{
                    background: "#111111",
                    border: "1px solid #2A2A2A",
                    borderRadius: 10,
                    overflow: "hidden",
                  }}
                >
                  {/* Table header */}
                  <div
                    style={{
                      padding: "16px 20px 12px",
                      borderBottom: "1px solid #2A2A2A",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#FFFFFF",
                          letterSpacing: "-0.01em",
                        }}
                      >
                        Uploaded Audio
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#D1D5DB",
                          marginTop: 1,
                        }}
                      >
                        {interviews.length} file
                        {interviews.length !== 1 ? "s" : ""} total
                      </div>
                    </div>
                  </div>

                  {/* Column headers */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 100px 80px 56px 72px 80px",
                      padding: "8px 20px",
                      borderBottom: "1px solid #2A2A2A",
                    }}
                  >
                    {["File", "Date", "Duration", "Spkrs", "Segs", "Status"].map(
                      (h) => (
                        <span
                          key={h}
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: "#D1D5DB",
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                          }}
                        >
                          {h}
                        </span>
                      )
                    )}
                  </div>

                  {/* Rows */}
                  {interviews.map((i, idx) => (
                    <div
                      key={i.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 100px 80px 56px 72px 80px",
                        padding: "11px 20px",
                        borderBottom:
                          idx < interviews.length - 1
                            ? "1px solid #1F2937"
                            : "none",
                        alignItems: "center",
                        cursor: "pointer",
                        transition: "background 0.12s",
                        animation: `fadeUp 0.3s ease ${0.1 + idx * 0.04}s both`,
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background =
                          "#1A1A1A";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background =
                          "transparent";
                      }}
                    >
                      {/* Name */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 9,
                          minWidth: 0,
                        }}
                      >
                        <span
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 7,
                            background: "#1F2937",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#D1D5DB"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z" />
                            <path d="M19 10v2a7 7 0 01-14 0v-2" />
                            <line x1="12" y1="19" x2="12" y2="22" />
                            <line x1="8" y1="22" x2="16" y2="22" />
                          </svg>
                        </span>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: "#FFFFFF",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {i.title || i.filename || "Untitled"}
                        </span>
                      </div>

                      {/* Date */}
                      <span
                        style={{
                          fontFamily: "'DM Mono', monospace",
                          fontSize: 11,
                          color: "#D1D5DB",
                        }}
                      >
                        {i.displayDate}
                      </span>

                      {/* Duration */}
                      <span
                        style={{
                          fontFamily: "'DM Mono', monospace",
                          fontSize: 11,
                          color: "#E5E7EB",
                        }}
                      >
                        {formatDuration(i.duration)}
                      </span>

                      {/* Speakers */}
                      <span
                        style={{
                          fontFamily: "'DM Mono', monospace",
                          fontSize: 11,
                          color: "#E5E7EB",
                        }}
                      >
                        {i.speakerCount}
                      </span>

                      {/* Segments */}
                      <span
                        style={{
                          fontFamily: "'DM Mono', monospace",
                          fontSize: 11,
                          color: "#E5E7EB",
                        }}
                      >
                        {i.chunkCount}
                      </span>

                      {/* Status */}
                      <StatusBadge status={i.status} />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}
