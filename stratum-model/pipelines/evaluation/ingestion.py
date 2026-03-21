"""
undertone / pipeline / ingestion.py
------------------------------------
Step 1: Ingestion & Normalization

Responsibilities:
  - Accept an audio or video file path
  - If video: extract audio track via FFmpeg
  - Load audio with librosa, resample to 16kHz mono
  - Validate format, duration, and integrity
  - Write the normalized WAV to the session directory
  - Return an IngestionResult with everything downstream needs

Nothing downstream touches the original file.
Everything reads from the normalized WAV written here.
"""

import os
import logging
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

import librosa
import soundfile as sf
import numpy as np

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TARGET_SAMPLE_RATE = 16_000          # Hz  — Whisper and librosa both expect this
TARGET_CHANNELS    = 1               # mono
MIN_DURATION_SEC   = 5.0             # reject anything shorter than this
MAX_DURATION_SEC   = 7_200.0         # 2 hours — hard upper limit

SUPPORTED_AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a", ".flac", ".ogg", ".aac"}
SUPPORTED_VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".avi", ".webm"}


# ---------------------------------------------------------------------------
# Result object
# ---------------------------------------------------------------------------

@dataclass
class IngestionResult:
    """
    Everything produced by this step.
    All downstream stages receive this object — nothing else.
    """
    interview_id:       str               # unique ID for this session
    original_path:      Path              # original uploaded file (read-only reference)
    normalized_path:    Path              # 16kHz mono WAV — the canonical signal
    sample_rate:        int               # always TARGET_SAMPLE_RATE after normalization
    duration_sec:       float             # duration of the normalized audio in seconds
    num_samples:        int               # total samples in the normalized array
    was_video:          bool              # True if FFmpeg extraction was needed
    extracted_audio_path: Path | None     # intermediate audio from FFmpeg, if applicable
    file_size_bytes:    int               # size of original file
    warnings:           list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class IngestionError(Exception):
    """Raised when ingestion cannot proceed. Pipeline should halt."""
    pass


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _validate_path(file_path: Path) -> None:
    """Check the file exists and has a supported extension."""
    if not file_path.exists():
        raise IngestionError(f"File not found: {file_path}")

    if not file_path.is_file():
        raise IngestionError(f"Path is not a file: {file_path}")

    ext = file_path.suffix.lower()
    all_supported = SUPPORTED_AUDIO_EXTENSIONS | SUPPORTED_VIDEO_EXTENSIONS
    if ext not in all_supported:
        raise IngestionError(
            f"Unsupported file type '{ext}'. "
            f"Supported: {sorted(all_supported)}"
        )


def _is_video(file_path: Path) -> bool:
    return file_path.suffix.lower() in SUPPORTED_VIDEO_EXTENSIONS


def _extract_audio_from_video(video_path: Path, output_dir: Path) -> Path:
    """
    Use FFmpeg to pull the audio track out of a video file.
    Writes a WAV to output_dir. Returns the path.

    FFmpeg flags:
      -vn          skip video stream
      -acodec pcm_s16le  uncompressed PCM (librosa reads this cleanly)
      -ar 16000    resample to target rate at extraction time (saves librosa work)
      -ac 1        downmix to mono at extraction time
      -y           overwrite without prompting
    """
    output_path = output_dir / f"{video_path.stem}_extracted.wav"

    cmd = [
        "ffmpeg",
        "-i",     str(video_path),
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar",     str(TARGET_SAMPLE_RATE),
        "-ac",     str(TARGET_CHANNELS),
        "-y",
        str(output_path),
    ]

    logger.info(f"[ingestion] Extracting audio from video: {video_path.name}")
    logger.debug(f"[ingestion] FFmpeg command: {' '.join(cmd)}")

    result = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    if result.returncode != 0:
        stderr_text = result.stderr.decode("utf-8", errors="replace")
        raise IngestionError(
            f"FFmpeg failed on '{video_path.name}'.\n"
            f"FFmpeg stderr:\n{stderr_text}"
        )

    if not output_path.exists():
        raise IngestionError(
            f"FFmpeg exited cleanly but output file was not created: {output_path}"
        )

    logger.info(f"[ingestion] Audio extracted to: {output_path.name}")
    return output_path


def _load_and_normalize(
    audio_path: Path,
    warnings: list[str],
) -> tuple[np.ndarray, int]:
    """
    Load audio with librosa and normalize to 16kHz mono float32.
    Returns (audio_array, sample_rate).
    """
    logger.info(f"[ingestion] Loading audio: {audio_path.name}")

    try:
        audio, sr = librosa.load(
            str(audio_path),
            sr=TARGET_SAMPLE_RATE,   # librosa resamples on load if needed
            mono=True,               # downmix to mono if stereo
        )
    except Exception as e:
        raise IngestionError(
            f"librosa could not load '{audio_path.name}': {e}"
        )

    # Sanity check: librosa should have enforced these, but verify
    assert sr == TARGET_SAMPLE_RATE, f"Unexpected sample rate after load: {sr}"
    assert audio.ndim == 1,          f"Unexpected audio shape after load: {audio.shape}"

    # Check for silence / near-silent file — likely corrupt or empty
    rms = float(np.sqrt(np.mean(audio ** 2)))
    if rms < 1e-6:
        warnings.append(
            "Audio RMS is near zero. File may be silent or corrupt. "
            "Pipeline will continue but results may be meaningless."
        )
        logger.warning("[ingestion] Near-silent audio detected.")

    # Check for clipping (values outside [-1, 1])
    peak = float(np.max(np.abs(audio)))
    if peak > 1.0:
        warnings.append(f"Audio peak ({peak:.3f}) exceeds 1.0 — possible clipping.")
        audio = audio / peak   # normalize to prevent downstream issues
        logger.warning(f"[ingestion] Clipped audio normalized. Peak was {peak:.3f}.")

    return audio, sr


def _validate_duration(duration_sec: float) -> None:
    if duration_sec < MIN_DURATION_SEC:
        raise IngestionError(
            f"Audio too short ({duration_sec:.1f}s). "
            f"Minimum is {MIN_DURATION_SEC}s."
        )
    if duration_sec > MAX_DURATION_SEC:
        raise IngestionError(
            f"Audio too long ({duration_sec:.1f}s). "
            f"Maximum is {MAX_DURATION_SEC / 3600:.1f} hours."
        )


def _write_normalized_wav(
    audio: np.ndarray,
    sample_rate: int,
    output_path: Path,
) -> None:
    """Write the normalized float32 array as a 16-bit PCM WAV."""
    logger.info(f"[ingestion] Writing normalized WAV: {output_path.name}")
    sf.write(str(output_path), audio, sample_rate, subtype="PCM_16")


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def ingest(
    file_path:    Path | str,
    session_dir:  Path | str,
    interview_id: str,
) -> IngestionResult:
    """
    Run ingestion and normalization for a single uploaded file.

    Args:
        file_path:    Path to the uploaded audio or video file.
        session_dir:  Directory where all session artifacts are written.
                      Will be created if it does not exist.
        interview_id: Unique identifier for this interview session.
                      Used for file naming and downstream references.

    Returns:
        IngestionResult — passed to every downstream pipeline stage.

    Raises:
        IngestionError — if the file cannot be processed. Pipeline should halt.
    """
    file_path   = Path(file_path)
    session_dir = Path(session_dir)
    warnings: list[str] = []

    # -- 1. Validate input path and extension --------------------------------
    _validate_path(file_path)
    file_size = file_path.stat().st_size
    logger.info(
        f"[ingestion] Starting ingestion for: {file_path.name} "
        f"({file_size / 1_048_576:.1f} MB)"
    )

    # -- 2. Prepare session directory ----------------------------------------
    session_dir.mkdir(parents=True, exist_ok=True)
    chunks_dir = session_dir / "chunks"
    chunks_dir.mkdir(exist_ok=True)

    # -- 3. Extract audio if video -------------------------------------------
    is_video = _is_video(file_path)
    extracted_audio_path: Path | None = None

    if is_video:
        extracted_audio_path = _extract_audio_from_video(file_path, session_dir)
        source_for_librosa = extracted_audio_path
    else:
        source_for_librosa = file_path

    # -- 4. Load and normalize -----------------------------------------------
    audio, sample_rate = _load_and_normalize(source_for_librosa, warnings)

    # -- 5. Validate duration ------------------------------------------------
    duration_sec = float(len(audio)) / sample_rate
    _validate_duration(duration_sec)
    logger.info(f"[ingestion] Duration: {duration_sec:.2f}s")

    # -- 6. Write normalized WAV ---------------------------------------------
    normalized_path = session_dir / f"{interview_id}_normalized.wav"
    _write_normalized_wav(audio, sample_rate, normalized_path)

    # -- 7. Build and return result ------------------------------------------
    result = IngestionResult(
        interview_id         = interview_id,
        original_path        = file_path,
        normalized_path      = normalized_path,
        sample_rate          = sample_rate,
        duration_sec         = duration_sec,
        num_samples          = len(audio),
        was_video            = is_video,
        extracted_audio_path = extracted_audio_path,
        file_size_bytes      = file_size,
        warnings             = warnings,
    )

    logger.info(
        f"[ingestion] Complete. "
        f"{'Video → audio extracted. ' if is_video else ''}"
        f"Normalized WAV: {normalized_path.name} | "
        f"Duration: {duration_sec:.2f}s | "
        f"Samples: {len(audio):,}"
    )

    if warnings:
        for w in warnings:
            logger.warning(f"[ingestion] WARNING: {w}")

    return result