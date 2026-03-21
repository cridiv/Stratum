import logging
import numpy as np

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Flag thresholds
# ---------------------------------------------------------------------------

CROSSTALK_CONFIDENCE_THRESHOLD = 0.70   # below this → crosstalk_detected


# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------

def fuse(
    chunks:             list[dict],
    acoustic_results:   list[dict | None],
    transcript_results: list[dict | None],
    emotion_results:    list[dict | None],
    embedding_results:  list[list[float] | None] | None = None,
) -> list[dict]:
    """
    Merge all pipeline outputs into complete chunk objects.

    Args:
        chunks             : Scaffold objects from chunk_assembly
        acoustic_results   : Output of extract_acoustics()
        transcript_results : Output of align_transcripts()
        emotion_results    : Output of score_emotions()
        embedding_results  : Output of embed() — optional, can be None

    Returns:
        Complete chunk array — one fully populated dict per chunk
    """

    # -- 1. Compute interview-level signal distributions --------------------
    distributions = _compute_distributions(acoustic_results)
    logger.info(
        f"[fusion] Distributions computed. "
        f"RMS median: {distributions['rms_median']:.4f} | "
        f"Pitch variance 75th pct: {distributions['pitch_variance_75th']:.2f} | "
        f"Silence median: {distributions['silence_ratio_median']:.3f}"
    )

    # -- 2. Merge everything into one object per chunk ----------------------
    fused_chunks = []

    for i, chunk in enumerate(chunks):
        acoustic   = acoustic_results[i]   if i < len(acoustic_results)   else None
        transcript = transcript_results[i] if i < len(transcript_results) else None
        emotion    = emotion_results[i]    if i < len(emotion_results)    else None
        embedding  = embedding_results[i]  if embedding_results and i < len(embedding_results) else None

        flags = _compute_flags(chunk, acoustic, distributions)

        fused = {
            "id":           chunk["id"],
            "interview_id": chunk["interview_id"],
            "index":        chunk["index"],

            "transcript": {
                "text":      transcript["text"]      if transcript else None,
                "words":     transcript["words"]     if transcript else [],
                "sentiment": transcript["sentiment"] if transcript else None,
            },

            "timing": chunk["timing"],

            "speaker": chunk["speaker"],

            "acoustic": acoustic,

            "emotion": emotion,

            "embedding": embedding,

            "audio_ref": chunk["audio_ref"],

            "flags": flags,
        }

        fused_chunks.append(fused)

        logger.debug(
            f"[fusion] {chunk['id']} | "
            f"flags: {[k for k, v in flags.items() if v]}"
        )

    flagged = sum(1 for c in fused_chunks if any(c["flags"].values()))
    logger.info(
        f"[fusion] Complete. {len(fused_chunks)} chunks fused. "
        f"{flagged} chunks have at least one flag set."
    )

    return fused_chunks


# ---------------------------------------------------------------------------
# Distributions
# ---------------------------------------------------------------------------

def _compute_distributions(acoustic_results: list[dict | None]) -> dict:
    """
    Compute interview-level signal distributions from all acoustic results.
    These are used to derive flags relative to the interview, not globally.
    """
    valid = [r for r in acoustic_results if r is not None]

    rms_values            = [r["energy"]["normalized"]  for r in valid if r["energy"]["normalized"] is not None]
    pitch_variance_values = [r["pitch"]["variance"]     for r in valid]
    silence_ratio_values  = [r["silence"]["ratio"]      for r in valid]
    pause_count_values    = [r["silence"]["pause_count"] for r in valid]

    def safe_percentile(values, pct):
        return float(np.percentile(values, pct)) if values else 0.0

    return {
        "rms_median":              safe_percentile(rms_values,            50),
        "rms_25th":                safe_percentile(rms_values,            25),
        "pitch_variance_75th":     safe_percentile(pitch_variance_values, 75),
        "silence_ratio_median":    safe_percentile(silence_ratio_values,  50),
        "pause_count_median":      safe_percentile(pause_count_values,    50),
    }


# ---------------------------------------------------------------------------
# Flag computation
# ---------------------------------------------------------------------------

def _compute_flags(
    chunk:         dict,
    acoustic:      dict | None,
    distributions: dict,
) -> dict:
    """
    Derive boolean flags for a single chunk relative to interview distributions.
    """

    # crosstalk_detected — already computed in chunk assembly
    crosstalk = chunk["speaker"]["confidence"] < CROSSTALK_CONFIDENCE_THRESHOLD

    if acoustic is None:
        return {
            "hesitation_detected": False,
            "energy_drop":         False,
            "pitch_instability":   False,
            "crosstalk_detected":  crosstalk,
        }

    # energy_drop — normalized RMS below 25th percentile of interview
    energy_drop = (
        acoustic["energy"]["normalized"] is not None and
        acoustic["energy"]["normalized"] < distributions["rms_25th"]
    )

    # pitch_instability — pitch variance above 75th percentile of interview
    pitch_instability = (
        acoustic["pitch"]["variance"] > distributions["pitch_variance_75th"]
    )

    # hesitation_detected — silence ratio AND pause count both above interview median
    hesitation_detected = (
        acoustic["silence"]["ratio"]       > distributions["silence_ratio_median"] and
        acoustic["silence"]["pause_count"] > distributions["pause_count_median"]
    )

    return {
        "hesitation_detected": hesitation_detected,
        "energy_drop":         energy_drop,
        "pitch_instability":   pitch_instability,
        "crosstalk_detected":  crosstalk,
    }