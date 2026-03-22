"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  analyzeInterview,
  listInterviews,
  type InterviewData,
} from "@/lib/api";

function formatDuration(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "00:00";
  }

  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);

  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function TranscriptRecordsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [records, setRecords] = useState<InterviewData[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<"idle" | "uploading" | "transcribing">("idle");
  const [activeUploadName, setActiveUploadName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const loadRecords = async () => {
    try {
      setLoading(true);
      setError(null);
      const interviews = await listInterviews();
      setRecords(interviews);
    } catch (err) {
      console.error("Failed to load interview records", err);
      setError("Could not load transcript records.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, []);

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const selected = event.target.files?.[0];

    if (!selected) {
      return;
    }

    try {
      setUploading(true);
      setUploadPhase("uploading");
      setActiveUploadName(selected.name);
      setError(null);
      // Backend starts transcript processing immediately after upload.
      setUploadPhase("transcribing");
      const result = await analyzeInterview(selected);
      await loadRecords();

      if (result.interviewId) {
        router.push(`/transcript/${result.interviewId}`);
      }
    } catch (err) {
      console.error("Upload failed", err);
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      setUploadPhase("idle");
      setActiveUploadName("");
      event.target.value = "";
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: #F7F6F3; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div
        style={{
          fontFamily: "'DM Sans', sans-serif",
          minHeight: "100vh",
          background: "#F7F6F3",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header
          style={{
            background: "#FFFFFF",
            borderBottom: "1px solid #E9EAEC",
            padding: "12px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "#111827",
                letterSpacing: "-0.02em",
              }}
            >
              Transcript Records
            </div>
            <div
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: 11,
                color: "#9CA3AF",
                marginTop: 2,
              }}
            >
              Full transcript history
            </div>
          </div>

          <button
            onClick={openFilePicker}
            disabled={uploading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "7px 12px",
              borderRadius: 7,
              border: "1px solid #E9EAEC",
              background: uploading ? "#E5E7EB" : "#111827",
              color: "#FFFFFF",
              fontSize: 12,
              fontWeight: 600,
              cursor: uploading ? "not-allowed" : "pointer",
              transition: "opacity 0.15s",
            }}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            {uploading
              ? uploadPhase === "transcribing"
                ? "Transcribing..."
                : "Uploading..."
              : "Upload"}
          </button>
        </header>

        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          hidden
          onChange={handleFileChange}
        />

        <main style={{ flex: 1, padding: "28px 24px 42px" }}>
          {uploading && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(247, 246, 243, 0.82)",
                backdropFilter: "blur(2px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 40,
              }}
            >
              <div
                style={{
                  width: "min(92vw, 420px)",
                  background: "#FFFFFF",
                  border: "1px solid #E9EAEC",
                  borderRadius: 12,
                  padding: "20px 18px",
                  boxShadow: "0 14px 38px rgba(17,24,39,0.08)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    border: "3px solid #E5E7EB",
                    borderTopColor: "#111827",
                    animation: "spin 0.75s linear infinite",
                  }}
                />
                <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
                  {uploadPhase === "transcribing"
                    ? "Transcript is in progress"
                    : "Uploading audio"}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#6B7280",
                    fontFamily: "'DM Mono', monospace",
                  }}
                >
                  {uploadPhase === "transcribing"
                    ? "Transcribing now. This can take a minute for longer audio."
                    : "Preparing file for transcription..."}
                </div>
                {activeUploadName && (
                  <div
                    style={{
                      marginTop: 4,
                      maxWidth: "100%",
                      fontSize: 11,
                      color: "#9CA3AF",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={activeUploadName}
                  >
                    {activeUploadName}
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <div
              style={{
                marginBottom: 14,
                background: "#FEF2F2",
                border: "1px solid #FECACA",
                color: "#B91C1C",
                borderRadius: 8,
                padding: "10px 12px",
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {error}
            </div>
          )}

          {loading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "55vh",
                color: "#6B7280",
                fontSize: 15,
              }}
            >
              Loading records...
            </div>
          ) : records.length === 0 ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "55vh",
              }}
            >
              <button
                onClick={openFilePicker}
                disabled={uploading}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "12px 18px",
                  borderRadius: 10,
                  border: "1px solid #D1D5DB",
                  background: "#FFFFFF",
                  color: "#111827",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: uploading ? "not-allowed" : "pointer",
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                {uploading ? "Uploading..." : "Upload your first transcript"}
              </button>
            </div>
          ) : (
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E9EAEC",
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.6fr 140px 90px 80px 80px",
                  padding: "10px 16px",
                  borderBottom: "1px solid #F3F4F6",
                  background: "#FAFAFA",
                }}
              >
                {["Interview", "Date", "Duration", "Speakers", "Chunks"].map((header) => (
                  <span
                    key={header}
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: "#9CA3AF",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    {header}
                  </span>
                ))}
              </div>

              {records.map((record, index) => (
                <button
                  key={record.id}
                  onClick={() => router.push(`/transcript/${record.interviewId}`)}
                  style={{
                    width: "100%",
                    display: "grid",
                    gridTemplateColumns: "1.6fr 140px 90px 80px 80px",
                    padding: "12px 16px",
                    border: "none",
                    borderBottom:
                      index < records.length - 1 ? "1px solid #F9FAFB" : "none",
                    background: "#FFFFFF",
                    textAlign: "left",
                    cursor: "pointer",
                    alignItems: "center",
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.background = "#FAFAFA";
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.background = "#FFFFFF";
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#111827",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {record.interviewId}
                    </span>
                    <span
                      style={{
                        fontFamily: "'DM Mono', monospace",
                        fontSize: 10,
                        color: "#9CA3AF",
                      }}
                    >
                      {record.filename}
                    </span>
                  </span>

                  <span
                    style={{
                      fontFamily: "'DM Mono', monospace",
                      fontSize: 11,
                      color: "#6B7280",
                    }}
                  >
                    {formatDate(record.createdAt)}
                  </span>

                  <span
                    style={{
                      fontFamily: "'DM Mono', monospace",
                      fontSize: 11,
                      color: "#6B7280",
                    }}
                  >
                    {formatDuration(record.duration)}
                  </span>

                  <span
                    style={{
                      fontFamily: "'DM Mono', monospace",
                      fontSize: 11,
                      color: "#6B7280",
                    }}
                  >
                    {record.speakerCount}
                  </span>

                  <span
                    style={{
                      fontFamily: "'DM Mono', monospace",
                      fontSize: 11,
                      color: "#6B7280",
                    }}
                  >
                    {record.chunkCount}
                  </span>
                </button>
              ))}
            </div>
          )}
        </main>
      </div>
    </>
  );
}
