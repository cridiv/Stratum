"""
undertone / pipeline / diarization.py
---------------------------------------
Step 3: Speaker Diarization

Responsibilities:
  - Run pyannote.audio on the full normalized WAV
  - Produce a speaker timeline: list of {start, end, speaker_id} segments
  - Return the timeline as a lookup structure for Phase 4 (chunk assignment)

Nothing is written to DB here. Timeline lives in memory.
"""

import logging
from pathlib import Path

import soundfile as sf
import torch
from pyannote.audio import Pipeline

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Speaker confidence threshold — chunks where the dominant speaker
# covers less than this fraction are flagged as crosstalk
CROSSTALK_THRESHOLD = 0.70


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

# A single diarization segment — one speaker, one continuous stretch
DiarizationSegment = dict  # {start: float, end: float, speaker_id: str}

# The full timeline — ordered list of segments covering the whole recording
SpeakerTimeline = list[DiarizationSegment]


# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------

def diarize(
    normalized_path: Path,
    hf_token:        str,
) -> SpeakerTimeline:
    """
    Run speaker diarization on the full normalized WAV.

    Args:
        normalized_path : Path to the 16kHz mono normalized WAV
        hf_token        : HuggingFace access token for pyannote model access

    Returns:
        SpeakerTimeline — ordered list of {start, end, speaker_id} dicts
    """

    # -- 1. Load the pretrained pyannote diarization pipeline ----------------
    # pyannote.audio ships a pretrained speaker-diarization-3.1 pipeline.
    # It handles VAD, embedding extraction, and clustering internally.
    # The HuggingFace token is required because the model weights are gated —
    # you must accept the terms on HuggingFace before this works.
    logger.info("[diarization] Loading pyannote pipeline...")

    pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1",
        token=hf_token.strip(),
    )

    # -- 2. Run diarization on the full recording ----------------------------
    # pyannote accepts a file path directly.
    # It returns a pyannote Annotation object — an iterable of
    # (segment, track, label) tuples where label is the speaker ID string.
    # This runs on CPU by default. If a GPU is available it will use it.
    logger.info(f"[diarization] Running on: {normalized_path.name}")

    # Work around torchcodec/AudioDecoder issues by preloading audio in memory.
    waveform_np, sample_rate = sf.read(
        str(normalized_path),
        dtype="float32",
        always_2d=True,
    )
    waveform = torch.from_numpy(waveform_np.T)  # (channels, time)

    annotation = pipeline({
        "waveform": waveform,
        "sample_rate": sample_rate,
    })

    # -- 3. Convert pyannote Annotation into a flat list of dicts ------------
    # We don't want downstream code to depend on pyannote's Annotation type.
    # Convert everything to plain dicts right here so the rest of the pipeline
    # has no pyannote dependency beyond this module.
    #
    # pyannote labels speakers as "SPEAKER_00", "SPEAKER_01" etc.
    # We normalize these to "speaker_0", "speaker_1" for consistency
    # with the chunk schema.

    raw_timeline: SpeakerTimeline = []

    for segment, _, label in annotation.itertracks(yield_label=True):
        raw_timeline.append({
            "start":      round(segment.start, 3),
            "end":        round(segment.end,   3),
            "speaker_id": _normalize_label(label),
        })

    # Sort by start time — pyannote should already return them ordered
    # but we enforce it explicitly so Phase 4 can rely on ordering
    raw_timeline.sort(key=lambda s: s["start"])

    logger.info(
        f"[diarization] Complete. "
        f"{len(raw_timeline)} segments | "
        f"{len(_unique_speakers(raw_timeline))} speakers detected: "
        f"{_unique_speakers(raw_timeline)}"
    )

    return raw_timeline


def assign_speaker(
    chunk_start:     float,
    chunk_end:       float,
    timeline:        SpeakerTimeline,
) -> dict:
    """
    Given a chunk's time range, find the dominant speaker from the timeline.

    Called in Phase 4 (chunk metadata assembly) for every chunk.

    Returns a dict:
        {
            speaker_id:  str,
            confidence:  float,   # fraction of chunk duration this speaker covers
            crosstalk:   bool,    # True if no speaker covers >= CROSSTALK_THRESHOLD
        }
    """

    chunk_duration = chunk_end - chunk_start

    if chunk_duration <= 0:
        return {"speaker_id": "unknown", "confidence": 0.0, "crosstalk": False}

    # -- Find all timeline segments that overlap with this chunk --------------
    # A timeline segment overlaps the chunk if it starts before the chunk ends
    # and ends after the chunk starts.
    overlapping = [
        seg for seg in timeline
        if seg["start"] < chunk_end and seg["end"] > chunk_start
    ]

    if not overlapping:
        logger.warning(
            f"[diarization] No speaker found for chunk {chunk_start:.2f}s → {chunk_end:.2f}s"
        )
        return {"speaker_id": "unknown", "confidence": 0.0, "crosstalk": False}

    # -- Sum up how much time each speaker covers inside this chunk -----------
    speaker_durations: dict[str, float] = {}

    for seg in overlapping:
        # Clamp the segment to the chunk boundaries
        # A segment may extend beyond the chunk on either side
        overlap_start = max(seg["start"], chunk_start)
        overlap_end   = min(seg["end"],   chunk_end)
        overlap_dur   = overlap_end - overlap_start

        sid = seg["speaker_id"]
        speaker_durations[sid] = speaker_durations.get(sid, 0.0) + overlap_dur

    # -- Pick the speaker with the most time in this chunk -------------------
    dominant_speaker = max(speaker_durations, key=speaker_durations.__getitem__)
    dominant_duration = speaker_durations[dominant_speaker]
    confidence = round(dominant_duration / chunk_duration, 3)

    # -- Flag crosstalk if dominant speaker doesn't clearly own the chunk ----
    crosstalk = confidence < CROSSTALK_THRESHOLD

    return {
        "speaker_id": dominant_speaker,
        "confidence": confidence,
        "crosstalk":  crosstalk,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalize_label(label: str) -> str:
    """
    Convert pyannote speaker label to our schema format.
    "SPEAKER_00" -> "speaker_0"
    "SPEAKER_01" -> "speaker_1"
    """
    # pyannote labels are "SPEAKER_00", "SPEAKER_01" etc.
    try:
        number = int(label.split("_")[-1])
        return f"speaker_{number}"
    except (ValueError, IndexError):
        return label.lower().replace(" ", "_")


def _unique_speakers(timeline: SpeakerTimeline) -> list[str]:
    seen = []
    for seg in timeline:
        if seg["speaker_id"] not in seen:
            seen.append(seg["speaker_id"])
    return seen