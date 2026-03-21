"""
undertone / pipelines / evaluation / run_pipeline.py
------------------------------------------------------
Orchestrator — the single entry point for the entire pipeline.

Calling this runs everything:
  1. Ingestion & Normalization
  2. Segmentation
  3. Transcription + Diarization (AssemblyAI)
  4. Chunk Metadata Assembly
  5. Acoustic Extraction (librosa)
  6. Transcript Alignment + Emotion Scoring (Hume)
  7. Fusion & Flag Computation
  8. Pattern Detection
  9. Save output to JSON
 10. Score against ground truth (if ground_truth_path provided)

Usage:
    python run_pipeline.py <audio_file> <assemblyai_key> <hume_key> [ground_truth.json]
"""

import sys
import json
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(message)s")

from pipelines.evaluation.ingestion       import ingest
from pipelines.evaluation.segmentation    import segment
from pipelines.evaluation.transcribe      import transcribe, get_speaker_timeline
from pipelines.evaluation.chunk_metadata  import assemble_chunks
from pipelines.evaluation.acoustic        import extract_acoustics
from pipelines.evaluation.enrich          import align_transcripts, score_emotions
from pipelines.evaluation.fusion          import fuse
from pipelines.evaluation.pattern_detector import detect_patterns

# Scoring is optional — only runs if ground truth path is provided
try:
    from pipelines.evaluation.score import run_all as run_scoring
    SCORING_AVAILABLE = True
except ImportError:
    SCORING_AVAILABLE = False


def run_pipeline(
    file_path:          str | Path,
    assemblyai_key:     str,
    hume_key:           str,
    interview_id:       str            = "interview_001",
    session_dir:        str | Path | None = None,
    ground_truth_path:  str | None     = None,
    output_json_path:   str | None     = None,
) -> dict:
    """
    Run the full pipeline end to end.

    Args:
        file_path         : Path to audio or video file
        assemblyai_key    : AssemblyAI API key
        hume_key          : Hume AI API key
        interview_id      : Unique session identifier
        session_dir       : Where session artifacts are written.
                            Defaults to sessions/<interview_id>
        ground_truth_path : Optional path to ground truth JSON.
                            If provided, scoring runs automatically.
        output_json_path  : Optional path to save pipeline output JSON.
                            If not provided, saved to session_dir/output.json

    Returns:
        {
            "chunks":  [...],   # complete fused chunk array
            "audit":   {...},   # pattern detector findings
            "scores":  {...},   # evaluation scores (if ground truth provided)
            "output_path": str  # where the JSON was saved
        }
    """

    file_path   = Path(file_path)
    session_dir = Path(session_dir) if session_dir else Path("sessions") / interview_id
    chunks_dir  = session_dir / "chunks"

    # Default output path
    if output_json_path is None:
        output_json_path = str(session_dir / "output.json")

    # -------------------------------------------------------------------------
    # Step 1 — Ingestion & Normalization
    # -------------------------------------------------------------------------
    print("\n[1/8] Ingestion & Normalization")
    ingestion_result = ingest(
        file_path    = file_path,
        session_dir  = session_dir,
        interview_id = interview_id,
    )
    print(f"      {ingestion_result.duration_sec:.1f}s | normalized WAV ready")

    # -------------------------------------------------------------------------
    # Step 2 — Segmentation
    # -------------------------------------------------------------------------
    print("\n[2/8] Segmentation")
    segments = segment(
        normalized_path = ingestion_result.normalized_path,
        chunks_dir      = chunks_dir,
        sample_rate     = ingestion_result.sample_rate,
    )
    print(f"      {len(segments)} chunks produced")

    # -------------------------------------------------------------------------
    # Step 3 — Transcription + Speaker Diarization (AssemblyAI)
    # -------------------------------------------------------------------------
    print("\n[3/8] Transcription + Diarization (AssemblyAI)")
    transcript = transcribe(
        audio_path = str(ingestion_result.normalized_path),
        api_key    = assemblyai_key,
    )
    timeline = get_speaker_timeline(transcript)
    speakers = list(dict.fromkeys(u["speaker_id"] for u in timeline))
    print(f"      {len(timeline)} utterances | {len(speakers)} speakers: {speakers}")

    # -------------------------------------------------------------------------
    # Step 4 — Chunk Metadata Assembly
    # -------------------------------------------------------------------------
    print("\n[4/8] Chunk Metadata Assembly")
    chunks = assemble_chunks(
        segments     = segments,
        chunks_dir   = chunks_dir,
        timeline     = timeline,
        interview_id = interview_id,
    )
    print(f"      {len(chunks)} scaffold chunks built")

    # -------------------------------------------------------------------------
    # Step 5 — Acoustic Extraction (librosa)
    # -------------------------------------------------------------------------
    print("\n[5/8] Acoustic Extraction")
    acoustic_results = extract_acoustics(
        chunks     = chunks,
        chunks_dir = chunks_dir,
        sr         = ingestion_result.sample_rate,
    )
    extracted = sum(1 for r in acoustic_results if r)
    print(f"      {extracted} / {len(chunks)} chunks extracted")

    # -------------------------------------------------------------------------
    # Step 6 — Transcript Alignment + Emotion Scoring (Hume)
    # -------------------------------------------------------------------------
    print("\n[6/8] Transcript Alignment + Emotion Scoring (Hume)")
    transcript_results = align_transcripts(chunks, transcript)
    emotion_results    = score_emotions(chunks, hume_key)
    emotion_scored     = sum(1 for r in emotion_results if r)
    print(f"      {len(transcript_results)} chunks aligned | {emotion_scored} chunks emotion-scored")

    # -------------------------------------------------------------------------
    # Step 7 — Fusion & Flag Computation
    # -------------------------------------------------------------------------
    print("\n[7/8] Fusion & Flag Computation")
    fused_chunks = fuse(
        chunks             = chunks,
        acoustic_results   = acoustic_results,
        transcript_results = transcript_results,
        emotion_results    = emotion_results,
        embedding_results  = None,
    )
    flagged = sum(1 for c in fused_chunks if any(c["flags"].values()))
    print(f"      {len(fused_chunks)} chunks fused | {flagged} with flags set")

    # -------------------------------------------------------------------------
    # Step 8 — Pattern Detection
    # -------------------------------------------------------------------------
    print("\n[8/8] Pattern Detection")
    audit = detect_patterns(fused_chunks, interview_id)
    print(f"      {len(audit['findings'])} findings detected")

    # -------------------------------------------------------------------------
    # Save output to JSON
    # -------------------------------------------------------------------------
    # Build utterance list from AssemblyAI timeline for scoring
    utterances_for_scoring = [
        {
            "speaker_id": u["speaker_id"],
            "text":       u["text"],
            "sentiment":  u["sentiment"],
            "start":      u["start"],
            "end":        u["end"],
        }
        for u in timeline
    ]

    pipeline_output = {"chunks": fused_chunks, "audit": audit, "utterances": utterances_for_scoring}

    Path(output_json_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_json_path, "w") as f:
        json.dump(pipeline_output, f, indent=2, default=str)
    print(f"\nOutput saved to: {output_json_path}")

    # -------------------------------------------------------------------------
    # Scoring (optional — only if ground truth path provided)
    # -------------------------------------------------------------------------
    scores = None
    if ground_truth_path:
        if SCORING_AVAILABLE:
            print("\n--- EVALUATION SCORES ---")
            scores = run_scoring(ground_truth_path, output_json_path)
        else:
            print("\n[scoring] score.py not found — skipping evaluation.")

    print(f"\nPipeline complete. {len(fused_chunks)} chunks ready.\n")

    return {
        "chunks":      fused_chunks,
        "audit":       audit,
        "scores":      scores,
        "output_path": output_json_path,
    }


# -----------------------------------------------------------------------------
# CLI entry point
# -----------------------------------------------------------------------------

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python run_pipeline.py <audio_file> <assemblyai_key> <hume_key> [ground_truth.json]")
        sys.exit(1)

    file_path         = sys.argv[1]
    assemblyai_key    = sys.argv[2]
    hume_key          = sys.argv[3]
    ground_truth_path = sys.argv[4] if len(sys.argv) > 4 else None

    result = run_pipeline(
        file_path         = file_path,
        assemblyai_key    = assemblyai_key,
        hume_key          = hume_key,
        ground_truth_path = ground_truth_path,
    )

    print("--- SAMPLE OUTPUT (chunk_000) ---")
    print(json.dumps(result["chunks"][0], indent=2, default=str))