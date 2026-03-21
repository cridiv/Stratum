import logging
from collections import Counter

import numpy as np

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Thresholds
# ---------------------------------------------------------------------------

ENERGY_DECLINE_THRESHOLD    = 0.15   # early vs late RMS drop to flag as significant
ENERGY_RISE_THRESHOLD       = 0.15   # early vs late RMS rise to flag
CONCENTRATION_THRESHOLD     = 0.60   # hesitation concentration above this is a cluster
SENTIMENT_SHIFT_THRESHOLD   = 0.20   # sentiment ratio shift to flag as arc change


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def detect_patterns(
    fused_chunks: list[dict],
    interview_id: str,
) -> dict:
    """
    Run cross-chunk pattern analysis on the full fused chunk array.

    Args:
        fused_chunks : Complete chunk array from fusion.fuse()
        interview_id : Interview session ID

    Returns:
        Audit object with findings array and summary dict
    """

    if not fused_chunks:
        return {"interview_id": interview_id, "findings": [], "summary": {}}

    findings = []
    n        = len(fused_chunks)

    # Split into thirds for trajectory analysis
    third     = max(1, n // 3)
    early     = fused_chunks[:third]
    middle    = fused_chunks[third:third * 2]
    late      = fused_chunks[third * 2:]

    # -- 1. Energy trajectory ------------------------------------------------
    energy_summary, energy_findings = _analyze_energy(early, middle, late, fused_chunks)
    findings.extend(energy_findings)

    # -- 2. Emotion trends ---------------------------------------------------
    emotion_trends, emotion_findings = _analyze_emotion_trends(fused_chunks)
    findings.extend(emotion_findings)

    # -- 3. Hesitation clustering --------------------------------------------
    hesitation_concentration, hesitation_findings = _analyze_hesitation(fused_chunks)
    findings.extend(hesitation_findings)

    # -- 4. Speaker dominance ------------------------------------------------
    speaker_summary, speaker_findings = _analyze_speakers(fused_chunks)
    findings.extend(speaker_findings)

    # -- 5. Sentiment arc ----------------------------------------------------
    sentiment_arc, sentiment_findings = _analyze_sentiment_arc(early, middle, late)
    findings.extend(sentiment_findings)

    # -- Assign severity order for readability
    severity_order = {"high": 0, "medium": 1, "low": 2}
    findings.sort(key=lambda f: severity_order.get(f["severity"], 3))

    audit = {
        "interview_id": interview_id,
        "total_chunks": n,
        "findings":     findings,
        "summary": {
            "energy_trajectory":          energy_summary,
            "emotion_trends":             emotion_trends,
            "hesitation_concentration":   round(hesitation_concentration, 3),
            "speaker_dominance":          speaker_summary,
            "sentiment_arc":              sentiment_arc,
        },
    }

    logger.info(
        f"[pattern_detector] Complete. "
        f"{len(findings)} findings across {n} chunks."
    )

    return audit


# ---------------------------------------------------------------------------
# 1. Energy trajectory
# ---------------------------------------------------------------------------

def _analyze_energy(
    early: list[dict],
    middle: list[dict],
    late:   list[dict],
    all_chunks: list[dict],
) -> tuple[dict, list[dict]]:

    def avg_energy(chunks):
        scores = [
            c["acoustic"]["energy"]["normalized"]
            for c in chunks
            if c.get("acoustic") and c["acoustic"]["energy"]["normalized"] is not None
        ]
        return round(float(np.mean(scores)), 4) if scores else 0.0

    early_rms  = avg_energy(early)
    middle_rms = avg_energy(middle)
    late_rms   = avg_energy(late)

    summary = {"early": early_rms, "middle": middle_rms, "late": late_rms}
    findings = []

    drop = early_rms - late_rms
    if drop >= ENERGY_DECLINE_THRESHOLD:
        low_energy_chunks = [
            c["id"] for c in late
            if c.get("acoustic") and
               c["acoustic"]["energy"]["normalized"] is not None and
               c["acoustic"]["energy"]["normalized"] < early_rms * 0.7
        ]
        findings.append({
            "type":        "energy_decline",
            "description": f"Speaker energy dropped {drop:.2f} points from the start to the end of the interview.",
            "severity":    "high" if drop >= 0.25 else "medium",
            "chunk_refs":  low_energy_chunks,
        })

    rise = late_rms - early_rms
    if rise >= ENERGY_RISE_THRESHOLD:
        findings.append({
            "type":        "energy_rise",
            "description": f"Speaker energy increased {rise:.2f} points across the interview — growing engagement.",
            "severity":    "low",
            "chunk_refs":  [],
        })

    return summary, findings


# ---------------------------------------------------------------------------
# 2. Emotion trends
# ---------------------------------------------------------------------------

def _analyze_emotion_trends(fused_chunks: list[dict]) -> tuple[dict, list[dict]]:

    dimensions = ["confidence", "uncertainty", "distress", "positive_affect"]
    indices    = []
    dim_values = {d: [] for d in dimensions}

    for i, chunk in enumerate(fused_chunks):
        if chunk.get("emotion"):
            indices.append(i)
            for d in dimensions:
                dim_values[d].append(chunk["emotion"].get(d, 0.0))

    trends   = {}
    findings = []

    if len(indices) < 3:
        return {f"{d}_slope": 0.0 for d in dimensions}, []

    x = np.array(indices, dtype=float)

    for d in dimensions:
        y     = np.array(dim_values[d], dtype=float)
        slope = float(np.polyfit(x, y, 1)[0])
        trends[f"{d}_slope"] = round(slope, 6)

    # Flag meaningful rising trends
    if trends["uncertainty_slope"] > 0.0005:
        findings.append({
            "type":        "rising_uncertainty",
            "description": "Uncertainty is trending upward across the interview — the speaker became progressively less assured.",
            "severity":    "high" if trends["uncertainty_slope"] > 0.001 else "medium",
            "chunk_refs":  [],
        })

    if trends["distress_slope"] > 0.0003:
        findings.append({
            "type":        "rising_distress",
            "description": "Distress signals are increasing over the course of the interview.",
            "severity":    "high" if trends["distress_slope"] > 0.0008 else "medium",
            "chunk_refs":  [],
        })

    if trends["confidence_slope"] < -0.0005:
        findings.append({
            "type":        "declining_confidence",
            "description": "Confidence signals are declining as the interview progresses.",
            "severity":    "medium",
            "chunk_refs":  [],
        })

    if trends["positive_affect_slope"] > 0.0005:
        findings.append({
            "type":        "rising_positive_affect",
            "description": "Positive affect is increasing — the speaker warmed up over the conversation.",
            "severity":    "low",
            "chunk_refs":  [],
        })

    return trends, findings


# ---------------------------------------------------------------------------
# 3. Hesitation clustering
# ---------------------------------------------------------------------------

def _analyze_hesitation(fused_chunks: list[dict]) -> tuple[float, list[dict]]:

    n = len(fused_chunks)
    hesitation_indices = [
        i for i, c in enumerate(fused_chunks)
        if c.get("flags") and c["flags"].get("hesitation_detected")
    ]

    if not hesitation_indices or n < 3:
        return 0.0, []

    # Concentration score — how tightly clustered are the hesitation indices?
    # Compute std dev of indices normalized by interview length.
    # Low std dev relative to interview length = tightly clustered.
    std_dev      = float(np.std(hesitation_indices))
    max_possible = n / 2
    concentration = round(1.0 - min(std_dev / max_possible, 1.0), 3)

    findings = []

    if concentration >= CONCENTRATION_THRESHOLD:
        mid    = int(np.median(hesitation_indices))
        window = 5
        refs   = [
            fused_chunks[i]["id"]
            for i in hesitation_indices
            if abs(i - mid) <= window
        ]
        findings.append({
            "type":        "hesitation_cluster",
            "description": (
                f"Hesitation flags are concentrated around chunk {mid} "
                f"({fused_chunks[mid]['transcript']['text'][:60] if fused_chunks[mid]['transcript']['text'] else 'no text'}...). "
                f"This region likely corresponds to a difficult or sensitive topic."
            ),
            "severity":    "high" if concentration >= 0.80 else "medium",
            "chunk_refs":  refs,
        })

    return concentration, findings


# ---------------------------------------------------------------------------
# 4. Speaker dominance
# ---------------------------------------------------------------------------

def _analyze_speakers(fused_chunks: list[dict]) -> tuple[dict, list[dict]]:

    speaker_chunks:    dict[str, int]   = Counter()
    speaker_duration:  dict[str, float] = {}
    switch_count = 0
    prev_speaker = None

    for chunk in fused_chunks:
        sid      = chunk["speaker"]["id"]
        duration = chunk["timing"]["duration"]

        speaker_chunks[sid]   += 1
        speaker_duration[sid]  = round(speaker_duration.get(sid, 0.0) + duration, 3)

        if prev_speaker and sid != prev_speaker:
            switch_count += 1
        prev_speaker = sid

    dominant_speaker = max(speaker_chunks, key=speaker_chunks.__getitem__)
    total_duration   = sum(speaker_duration.values())

    summary = {
        "dominant_speaker":    dominant_speaker,
        "speaker_chunk_counts": dict(speaker_chunks),
        "speaker_durations":    speaker_duration,
        "speaker_switch_count": switch_count,
    }

    findings = []

    # Flag if one speaker dominates heavily
    dominant_pct = speaker_chunks[dominant_speaker] / len(fused_chunks)
    if dominant_pct >= 0.70:
        findings.append({
            "type":        "speaker_dominance",
            "description": f"{dominant_speaker} dominates {dominant_pct:.0%} of the interview.",
            "severity":    "low",
            "chunk_refs":  [],
        })

    # Flag high switch density — may indicate debate or interruption
    switch_rate = switch_count / len(fused_chunks)
    if switch_rate >= 0.40:
        findings.append({
            "type":        "high_switch_density",
            "description": f"Speaker switches occur in {switch_rate:.0%} of chunks — frequent back-and-forth or interruptions.",
            "severity":    "medium",
            "chunk_refs":  [],
        })

    return summary, findings


# ---------------------------------------------------------------------------
# 5. Sentiment arc
# ---------------------------------------------------------------------------

def _analyze_sentiment_arc(
    early:  list[dict],
    middle: list[dict],
    late:   list[dict],
) -> tuple[dict, list[dict]]:

    def sentiment_counts(chunks):
        counts = Counter(
            c["transcript"]["sentiment"]
            for c in chunks
            if c.get("transcript") and c["transcript"].get("sentiment")
        )
        return {
            "POSITIVE": counts.get("POSITIVE", 0),
            "NEUTRAL":  counts.get("NEUTRAL",  0),
            "NEGATIVE": counts.get("NEGATIVE", 0),
        }

    def negative_ratio(counts):
        total = sum(counts.values())
        return counts["NEGATIVE"] / total if total > 0 else 0.0

    early_counts  = sentiment_counts(early)
    middle_counts = sentiment_counts(middle)
    late_counts   = sentiment_counts(late)

    arc = {
        "early":  early_counts,
        "middle": middle_counts,
        "late":   late_counts,
    }

    findings = []

    early_neg = negative_ratio(early_counts)
    late_neg  = negative_ratio(late_counts)
    shift     = late_neg - early_neg

    if shift >= SENTIMENT_SHIFT_THRESHOLD:
        findings.append({
            "type":        "sentiment_decline",
            "description": f"Negative sentiment increased by {shift:.0%} from the start to the end of the interview.",
            "severity":    "high" if shift >= 0.35 else "medium",
            "chunk_refs":  [],
        })
    elif -shift >= SENTIMENT_SHIFT_THRESHOLD:
        findings.append({
            "type":        "sentiment_improvement",
            "description": f"Sentiment improved across the interview — negative tone decreased by {-shift:.0%}.",
            "severity":    "low",
            "chunk_refs":  [],
        })

    return arc, findings