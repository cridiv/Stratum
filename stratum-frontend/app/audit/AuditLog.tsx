"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditFinding {
  type: string;
  severity: "high" | "moderate" | "low";
  description: string;
  chunks: string[];
}

interface AuditObject {
  summary?: string;
  findings?: AuditFinding[];
  [key: string]: unknown;
}

interface InterviewItem {
  id: string;
  interviewId: string;
  filename: string;
  title: string | null;
  duration: number;
  speakerCount: number;
  chunkCount: number;
  audit: AuditObject;
  scores: Record<string, unknown> | null;
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function severityStyle(severity: string): { color: string; bg: string; border: string } {
  if (severity === "high")     return { color: "#FCA5A5", bg: "rgba(239,68,68,0.08)",  border: "rgba(239,68,68,0.2)"  };
  if (severity === "moderate") return { color: "#FCD34D", bg: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.2)" };
  return                              { color: "#86EFAC", bg: "rgba(34,197,94,0.07)",  border: "rgba(34,197,94,0.18)" };
}

function findingTypeLabel(type: string): string {
  const map: Record<string, string> = {
    energy_decline:      "Energy Decline",
    uncertainty_trend:   "Uncertainty Trend",
    hesitation_cluster:  "Hesitation Cluster",
    sentiment_arc:       "Sentiment Arc",
    speaker_dominance:   "Speaker Dominance",
    pitch_instability:   "Pitch Instability",
    crosstalk:           "Crosstalk",
  };
  return map[type] ?? type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function formatUnknown(value: unknown): string {
  if (value == null) return "-";
  if (typeof value === "number") return Number.isFinite(value) ? value.toFixed(3) : String(value);
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return value.map((v) => formatUnknown(v)).join(", ");
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeFindings(audit: AuditObject): AuditFinding[] {
  const raw = audit?.findings;
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((item): item is AuditFinding => typeof item === "object" && item !== null)
    .map((item) => ({
      type: typeof item.type === "string" ? item.type : "unknown",
      severity:
        item.severity === "high" || item.severity === "moderate" || item.severity === "low"
          ? item.severity
          : "low",
      description: typeof item.description === "string" ? item.description : formatUnknown(item.description),
      chunks: Array.isArray(item.chunks) ? item.chunks.map((c) => String(c)) : [],
    }));
}

function FindingIcon({ type }: { type: string }) {
  const color = "currentColor";
  const w = 13;

  if (type === "energy_decline")
    return <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>;
  if (type === "uncertainty_trend")
    return <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
  if (type === "hesitation_cluster")
    return <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>;
  if (type === "sentiment_arc")
    return <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12c0-4.97 4.03-9 9-9s9 4.03 9 9"/><polyline points="3 12 7 16 11 12"/></svg>;
  return <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AuditLogPage() {
  const router = useRouter();
  const [interviews, setInterviews]   = useState<InterviewItem[]>([]);
  const [expanded, setExpanded]       = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = getAccessToken();
        if (!token) {
          router.push("/signin");
          return;
        }

        const res = await fetch(`${API_BASE}/interviews`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.status === 401) {
          setError("Session expired. Please sign in again.");
          router.push("/signin");
          return;
        }
        if (!res.ok) throw new Error("Failed to load interviews");
        const data = await res.json();
        setInterviews(Array.isArray(data) ? data : data.interviews ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  const totalFindings = useMemo(
    () => interviews.reduce((sum, i) => sum + normalizeFindings(i.audit).length, 0),
    [interviews],
  );

  const totalHighSeverity = useMemo(
    () => interviews.reduce((sum, i) =>
      sum + normalizeFindings(i.audit).filter((f) => f.severity === "high").length, 0),
    [interviews],
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap');

        @keyframes audit-fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes audit-spin { to { transform: rotate(360deg); } }

        .audit-row:hover { background: rgba(232,185,106,0.04) !important; }
        .audit-run-btn:hover { border-color: rgba(232,185,106,0.25) !important; background: rgba(232,185,106,0.05) !important; }
      `}</style>

      <div
        style={{
          fontFamily: "'DM Sans', sans-serif",
          background: "#000000",
          minHeight: "100vh",
          padding: "32px 28px",
          color: "#F0EDE8",
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div
          style={{
            marginBottom: 24,
            animation: "audit-fade-up 0.4s ease both",
          }}
        >
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, color: "#F0EDE8", margin: "0 0 4px", letterSpacing: "-0.02em" }}>
            Audit Log
          </h1>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "rgba(220,215,205,0.4)", margin: 0 }}>
            Pattern detector findings per interview
          </p>
        </div>

        {/* ── Stats row ──────────────────────────────────────────────────── */}
        {!loading && !error && (
          <div
            style={{
              display: "flex",
              gap: 12,
              marginBottom: 20,
              flexWrap: "wrap",
              animation: "audit-fade-up 0.4s ease 0.08s both",
            }}
          >
            {[
              { label: "Interviews",     value: interviews.length  },
              { label: "Total findings", value: totalFindings       },
              { label: "High severity",  value: totalHighSeverity   },
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  padding: "12px 18px",
                  borderRadius: 10,
                  border: "1px solid rgba(232,185,106,0.1)",
                  background: "rgba(232,185,106,0.04)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                  minWidth: 110,
                }}
              >
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 20, fontWeight: 500, color: "#E8B96A", letterSpacing: "-0.03em", lineHeight: 1 }}>
                  {s.value}
                </span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "rgba(220,215,205,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Main list ──────────────────────────────────────────────────── */}
        <div
          style={{
            border: "1px solid rgba(232,185,106,0.1)",
            borderRadius: 14,
            overflow: "hidden",
            background: "#000000",
            animation: "audit-fade-up 0.4s ease 0.14s both",
          }}
        >
          {/* Loading */}
          {loading && (
            <div style={{ padding: 32, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(232,185,106,0.2)", borderTopColor: "#E8B96A", animation: "audit-spin 0.75s linear infinite" }} />
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "rgba(220,215,205,0.4)" }}>Loading interviews…</span>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div style={{ padding: 24, fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#FCA5A5", background: "rgba(239,68,68,0.06)", borderBottom: "1px solid rgba(239,68,68,0.15)" }}>
              {error}
            </div>
          )}

          {/* Empty */}
          {!loading && !error && interviews.length === 0 && (
            <div style={{ padding: 32, fontFamily: "'DM Mono', monospace", fontSize: 12, color: "rgba(220,215,205,0.3)" }}>
              No interviews found.
            </div>
          )}

          {/* Rows */}
          {!loading && !error && interviews.map((interview, idx) => {
            const isOpen   = expanded === interview.interviewId;
            const findings = normalizeFindings(interview.audit);
            const summary  = interview.audit?.summary;
            const summaryText = typeof summary === "string" ? summary : formatUnknown(summary);
            const highCount = findings.filter(f => f.severity === "high").length;

            return (
              <div
                key={interview.interviewId}
                style={{ borderTop: idx === 0 ? "none" : "1px solid rgba(232,185,106,0.07)" }}
              >
                {/* Interview row */}
                <button
                  className="audit-row"
                  onClick={() => setExpanded(isOpen ? null : interview.interviewId)}
                  style={{
                    width: "100%",
                    border: "none",
                    background: isOpen ? "rgba(232,185,106,0.04)" : "transparent",
                    padding: "15px 18px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    gap: 12,
                    transition: "background 0.12s",
                  }}
                >
                  {/* Left */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    {/* Chevron */}
                    <svg
                      width="11" height="11" viewBox="0 0 24 24" fill="none"
                      style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", flexShrink: 0, color: "rgba(232,185,106,0.5)" }}
                    >
                      <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, color: "#F0EDE8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {interview.title ?? interview.filename}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "rgba(220,215,205,0.35)" }}>
                          {interview.filename}
                        </span>
                        <span style={{ width: 2, height: 2, borderRadius: "50%", background: "rgba(220,215,205,0.2)", display: "inline-block" }} />
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "rgba(220,215,205,0.35)" }}>
                          {formatDuration(interview.duration)}
                        </span>
                        <span style={{ width: 2, height: 2, borderRadius: "50%", background: "rgba(220,215,205,0.2)", display: "inline-block" }} />
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "rgba(220,215,205,0.35)" }}>
                          {interview.chunkCount} chunks
                        </span>
                        <span style={{ width: 2, height: 2, borderRadius: "50%", background: "rgba(220,215,205,0.2)", display: "inline-block" }} />
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "rgba(220,215,205,0.35)" }}>
                          {formatDate(interview.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right — finding counts */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    {highCount > 0 && (
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 500, color: "#FCA5A5", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 5, padding: "2px 7px" }}>
                        {highCount} high
                      </span>
                    )}
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "rgba(220,215,205,0.4)" }}>
                      {findings.length} finding{findings.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </button>

                {/* Expanded — audit detail */}
                {isOpen && (
                  <div style={{ padding: "4px 18px 20px 42px", borderTop: "1px solid rgba(232,185,106,0.07)" }}>

                    {/* Summary */}
                    {summary != null && (
                      <div
                        style={{
                          marginTop: 14,
                          padding: "12px 14px",
                          borderRadius: 10,
                          background: "rgba(232,185,106,0.05)",
                          border: "1px solid rgba(232,185,106,0.12)",
                          marginBottom: 14,
                        }}
                      >
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#E8B96A", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
                          Summary
                        </div>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "rgba(220,215,205,0.75)", margin: 0, lineHeight: 1.65, fontWeight: 300, whiteSpace: "pre-wrap" }}>
                          {summaryText}
                        </p>
                      </div>
                    )}

                    {/* Scores */}
                    {interview.scores && Object.keys(interview.scores).length > 0 && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                        {Object.entries(interview.scores).map(([key, val]) => (
                          <div
                            key={key}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 8,
                              border: "1px solid rgba(232,185,106,0.1)",
                              background: "rgba(11,16,24,0.8)",
                              display: "flex",
                              flexDirection: "column",
                              gap: 2,
                            }}
                          >
                            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 500, color: "#E8B96A" }}>
                              {formatUnknown(val)}
                            </span>
                            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "rgba(220,215,205,0.35)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                              {key.toUpperCase()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Findings */}
                    {findings.length === 0 && (
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "rgba(220,215,205,0.3)", padding: "8px 0" }}>
                        No findings for this interview.
                      </div>
                    )}

                    {findings.map((finding, fi) => {
                      const tone = severityStyle(finding.severity);
                      return (
                        <div
                          key={fi}
                          className="audit-run-btn"
                          style={{
                            marginTop: 8,
                            padding: "12px 14px",
                            borderRadius: 10,
                            border: "1px solid rgba(232,185,106,0.09)",
                            background: "#080C14",
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                            transition: "border-color 0.12s, background 0.12s",
                          }}
                        >
                          {/* Finding header */}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 7, color: "rgba(220,215,205,0.6)" }}>
                              <FindingIcon type={finding.type} />
                              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, fontWeight: 500, color: "#F0EDE8" }}>
                                {findingTypeLabel(finding.type)}
                              </span>
                            </div>
                            <span
                              style={{
                                fontFamily: "'DM Mono', monospace",
                                fontSize: 10,
                                fontWeight: 500,
                                color: tone.color,
                                background: tone.bg,
                                border: `1px solid ${tone.border}`,
                                borderRadius: 5,
                                padding: "2px 8px",
                                textTransform: "uppercase",
                                flexShrink: 0,
                              }}
                            >
                              {finding.severity}
                            </span>
                          </div>

                          {/* Description */}
                          <p style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(220,215,205,0.55)", lineHeight: 1.6, fontWeight: 300 }}>
                            {finding.description}
                          </p>

                          {/* Chunk refs */}
                          {finding.chunks && finding.chunks.length > 0 && (
                            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                              {finding.chunks.map((cid) => (
                                <span
                                  key={cid}
                                  style={{
                                    fontFamily: "'DM Mono', monospace",
                                    fontSize: 10,
                                    color: "rgba(232,185,106,0.6)",
                                    background: "rgba(232,185,106,0.06)",
                                    border: "1px solid rgba(232,185,106,0.12)",
                                    borderRadius: 4,
                                    padding: "2px 6px",
                                  }}
                                >
                                  {cid}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* View full transcript CTA */}
                    <button
                      onClick={() => router.push(`/transcript/${interview.interviewId}`)}
                      style={{
                        marginTop: 14,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "8px 16px",
                        borderRadius: 99,
                        border: "none",
                        background: "linear-gradient(135deg, #D4923C 0%, #C8725A 100%)",
                        color: "#080C14",
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        boxShadow: "0 0 16px rgba(212,146,60,0.2)",
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 24px rgba(212,146,60,0.35)";
                        (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 16px rgba(212,146,60,0.2)";
                        (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
                      }}
                    >
                      View transcript
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}