import uuid
import logging
from pathlib import Path

from fastapi import APIRouter, File, UploadFile, HTTPException, Query
from fastapi.responses import StreamingResponse

from pipelines.orchestrator import run_pipeline

logger = logging.getLogger(__name__)
router = APIRouter()

# Where session artifacts are stored
SESSIONS_DIR = Path("sessions")


# ---------------------------------------------------------------------------
# POST /analyze
# ---------------------------------------------------------------------------

@router.post("/analyze")
async def analyze(
    file:              UploadFile = File(...),
    assemblyai_key:    str        = Query(..., description="AssemblyAI API key"),
    hume_key:          str        = Query(..., description="Hume AI API key"),
    ground_truth_path: str | None = Query(None, description="Optional path to ground truth JSON for scoring"),
):
    """
    Accept an audio or video file, run the full pipeline, return results.

    The file is saved to disk first — the pipeline reads from disk,
    not from memory, because librosa and FFmpeg both need file paths.

    Returns the complete pipeline output:
      - chunks    : full fused chunk array
      - audit     : pattern detector findings
      - utterances: raw AssemblyAI utterances (used for scoring)
      - scores    : evaluation scores (if ground_truth_path provided)
    """

    # -- Generate a unique session ID for this request
    interview_id = str(uuid.uuid4())[:8]
    session_dir  = SESSIONS_DIR / interview_id
    session_dir.mkdir(parents=True, exist_ok=True)

    # -- Save uploaded file to disk
    suffix        = Path(file.filename).suffix or ".wav"
    uploaded_path = session_dir / f"upload{suffix}"

    try:
        content = await file.read()
        with open(uploaded_path, "wb") as f:
            f.write(content)
        logger.info(f"[/analyze] Saved upload: {uploaded_path} ({len(content) / 1_048_576:.1f} MB)")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {e}")

    # -- Run pipeline
    try:
        result = run_pipeline(
            file_path         = uploaded_path,
            assemblyai_key    = assemblyai_key,
            hume_key          = hume_key,
            interview_id      = interview_id,
            session_dir       = session_dir,
            ground_truth_path = ground_truth_path,
        )
    except Exception as e:
        logger.error(f"[/analyze] Pipeline failed: {e}")
        raise HTTPException(status_code=500, detail=f"Pipeline failed: {e}")

    return {
        "interview_id": interview_id,
        "chunks":       result["chunks"],
        "audit":        result["audit"],
        "utterances":   result.get("utterances", []),
        "scores":       result.get("scores"),
    }


# ---------------------------------------------------------------------------
# GET /chunk/{id}/audio
# ---------------------------------------------------------------------------

@router.get("/chunk/{chunk_id}/audio")
async def get_chunk_audio(
    chunk_id:     str,
    interview_id: str = Query(..., description="Interview session ID"),
):
    """
    Stream the WAV file for a given chunk.

    The frontend uses this for inline audio playback per sentence.
    NestJS proxies this to the frontend — binary audio never
    goes through the chunk JSON, only via this endpoint.

    Args:
        chunk_id     : e.g. chunk_004
        interview_id : session ID returned by /analyze
    """

    # Reconstruct the audio_ref path from interview_id and chunk_id
    chunk_path = SESSIONS_DIR / interview_id / "chunks" / f"{chunk_id}.wav"

    if not chunk_path.exists():
        raise HTTPException(
            status_code = 404,
            detail      = f"Audio not found for {chunk_id} in interview {interview_id}"
        )

    def iter_file():
        with open(chunk_path, "rb") as f:
            while chunk := f.read(65_536):   # stream in 64KB chunks
                yield chunk

    return StreamingResponse(
        iter_file(),
        media_type = "audio/wav",
        headers    = {
            "Content-Disposition": f"inline; filename={chunk_id}.wav",
            "Accept-Ranges":       "bytes",
        }
    )