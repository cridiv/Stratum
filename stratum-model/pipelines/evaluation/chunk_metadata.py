import logging
from pathlib import Path

from pipelines.evaluation.transcribe import assign_speaker

logger = logging.getLogger(__name__)


def assemble_chunks(
    segments:    list[tuple[float, float]],
    chunks_dir:  Path,
    timeline:    list[dict],
    interview_id: str,
) -> list[dict]:
    """
    Build scaffold chunk objects from segmentation output and speaker timeline.

    Args:
        segments     : Ordered (start, end) pairs from segmentation
        chunks_dir   : Directory where chunk WAV files were written
        timeline     : Speaker timeline from get_speaker_timeline()
        interview_id : Interview session ID for reference

    Returns:
        List of partial chunk dicts — timing and speaker assigned,
        transcript and acoustic fields empty, ready for phases 5 and 6
    """

    chunks = []

    for idx, (start, end) in enumerate(segments):
        audio_ref = str(chunks_dir / f"chunk_{idx:03d}.wav")

        # Cross-reference this chunk's time range against the speaker timeline
        speaker = assign_speaker(start, end, timeline)

        chunk = {
            "id":           f"chunk_{idx:03d}",
            "interview_id": interview_id,
            "index":        idx,

            "timing": {
                "start":    round(start, 3),
                "end":      round(end,   3),
                "duration": round(end - start, 3),
            },

            "speaker": {
                "id":         speaker["speaker_id"],
                "confidence": speaker["confidence"],
                "crosstalk":  speaker["crosstalk"],
            },

            "audio_ref": audio_ref,

            # Phases 5 and 6 fill these in
            "transcript": None,
            "acoustic":   None,
            "emotion":    None,
            "embedding":  None,
            "flags":      None,
        }

        chunks.append(chunk)
        logger.debug(
            f"[chunk_assembly] chunk_{idx:03d} | "
            f"{start:.2f}s → {end:.2f}s | "
            f"speaker: {speaker['speaker_id']} ({speaker['confidence']:.2f})"
            f"{' [CROSSTALK]' if speaker['crosstalk'] else ''}"
        )

    logger.info(f"[chunk_assembly] {len(chunks)} scaffold chunks built for interview {interview_id}")
    return chunks