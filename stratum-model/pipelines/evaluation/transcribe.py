"""
undertone / pipelines / evaluation / transcribe.py
----------------------------------------------------
Single AssemblyAI call handles:
  - Transcription                → WER
  - Speaker diarization          → DER
  - Sentiment per utterance      → Macro-F1
  - Topic detection (IAB)        → NMI + C_v
"""

import logging
import assemblyai as aai

logger = logging.getLogger(__name__)


def transcribe(
    audio_path:        str,
    api_key:           str,
    speakers_expected: int = 4,
) -> aai.Transcript:

    aai.settings.api_key = api_key

    config = aai.TranscriptionConfig(
        speech_models      = ["universal-3-pro", "universal-2"],
        language_detection = True,
        speaker_labels     = True,
        speakers_expected  = speakers_expected,
        sentiment_analysis = True,
        iab_categories     = True,
    )

    logger.info(f"[transcribe] Submitting to AssemblyAI: {audio_path}")
    transcript = aai.Transcriber().transcribe(audio_path, config)

    if transcript.status == aai.TranscriptStatus.error:
        raise RuntimeError(f"[transcribe] AssemblyAI failed: {transcript.error}")

    logger.info(
        f"[transcribe] Done. "
        f"{len(transcript.utterances)} utterances | "
        f"{len(set(u.speaker for u in transcript.utterances))} speakers"
    )

    return transcript


def get_speaker_timeline(transcript: aai.Transcript) -> list[dict]:
    """
    Convert AssemblyAI utterances into speaker timeline dicts.

    Sentiment comes from sentiment_analysis results, not utterances directly.
    We map each utterance's time window to its dominant sentiment by
    finding which sentiment_analysis results overlap with it.

    Returns:
        List of {start, end, speaker_id, text, sentiment} dicts
        Times in seconds.
    """

    # Build sentiment lookup from sentiment_analysis results
    # Each result has start, end (ms), sentiment
    sentiment_results = transcript.sentiment_analysis or []

    def dominant_sentiment_for_window(start_ms: float, end_ms: float) -> str | None:
        """Find the dominant sentiment for a time window."""
        counts = {}
        for s in sentiment_results:
            if s.start < end_ms and s.end > start_ms:
                val = s.sentiment.value if s.sentiment else None
                if val:
                    counts[val] = counts.get(val, 0) + 1
        if not counts:
            return None
        return max(counts, key=counts.__getitem__)

    timeline = []
    for u in transcript.utterances:
        sentiment = dominant_sentiment_for_window(u.start, u.end)
        timeline.append({
            "start":      round(u.start / 1000, 3),
            "end":        round(u.end   / 1000, 3),
            "speaker_id": f"speaker_{u.speaker.lower()}",
            "text":       u.text,
            "sentiment":  sentiment,
        })

    timeline.sort(key=lambda s: s["start"])
    return timeline


def assign_speaker(
    chunk_start:         float,
    chunk_end:           float,
    timeline:            list[dict],
    crosstalk_threshold: float = 0.70,
) -> dict:
    """
    Find the dominant speaker for a chunk's time window.
    Called by chunk_assembly for every chunk.
    """
    chunk_duration = chunk_end - chunk_start

    if chunk_duration <= 0:
        return {"speaker_id": "unknown", "confidence": 0.0, "crosstalk": False}

    overlapping = [
        seg for seg in timeline
        if seg["start"] < chunk_end and seg["end"] > chunk_start
    ]

    if not overlapping:
        return {"speaker_id": "unknown", "confidence": 0.0, "crosstalk": False}

    speaker_durations: dict[str, float] = {}
    for seg in overlapping:
        overlap_start = max(seg["start"], chunk_start)
        overlap_end   = min(seg["end"],   chunk_end)
        overlap_dur   = overlap_end - overlap_start
        sid = seg["speaker_id"]
        speaker_durations[sid] = speaker_durations.get(sid, 0.0) + overlap_dur

    dominant   = max(speaker_durations, key=speaker_durations.__getitem__)
    confidence = round(speaker_durations[dominant] / chunk_duration, 3)

    return {
        "speaker_id": dominant,
        "confidence": confidence,
        "crosstalk":  confidence < crosstalk_threshold,
    }