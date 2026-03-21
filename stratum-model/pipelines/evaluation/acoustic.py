import logging
from pathlib import Path

import numpy as np
import librosa

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SAMPLE_RATE        = 16_000
FRAME_LENGTH       = 512
HOP_LENGTH         = 160
N_MFCC             = 13
MIN_PAUSE_MS       = 50      # gaps below this are ignored (breath, not pause)
SILENCE_THRESHOLD  = 0.02     # same threshold used in segmentation


# ---------------------------------------------------------------------------
# Per-chunk extraction
# ---------------------------------------------------------------------------

def _extract_chunk(audio: np.ndarray, sr: int) -> dict:
    """
    Extract all acoustic features from a single chunk's audio array.
    Returns raw features — RMS normalization happens after all chunks are done.
    """

    total_frames = len(audio)
    duration_sec = total_frames / sr

    # -- RMS Energy ----------------------------------------------------------
    # Compute RMS per frame, then take mean and peak across all frames
    rms_frames = librosa.feature.rms(
        y            = audio,
        frame_length = FRAME_LENGTH,
        hop_length   = HOP_LENGTH,
    )[0]

    rms_mean = float(np.mean(rms_frames))
    rms_peak = float(np.max(rms_frames))


    # -- Pitch via piptrack --------------------------------------------------
    # piptrack returns (pitches, magnitudes) per frame.
    # We only keep frames where the magnitude is strong enough to be voiced.
    # From those voiced frames we compute mean, variance, min, max pitch.
    pitches, magnitudes = librosa.piptrack(
        y          = audio,
        sr         = sr,
        hop_length = HOP_LENGTH,
    )

    # For each frame, pick the pitch with the highest magnitude
    voiced_pitches = []
    for frame_idx in range(pitches.shape[1]):
        mag_col   = magnitudes[:, frame_idx]
        pitch_col = pitches[:, frame_idx]
        best_bin  = mag_col.argmax()

        # Only keep if magnitude is above noise floor and pitch is in human range
        if mag_col[best_bin] > 0 and 50 < pitch_col[best_bin] < 500:
            voiced_pitches.append(float(pitch_col[best_bin]))

    if voiced_pitches:
        pitch_mean     = round(float(np.mean(voiced_pitches)),   2)
        pitch_variance = round(float(np.var(voiced_pitches)),    2)
        pitch_min      = round(float(np.min(voiced_pitches)),    2)
        pitch_max      = round(float(np.max(voiced_pitches)),    2)
    else:
        pitch_mean     = 0.0
        pitch_variance = 0.0
        pitch_min      = 0.0
        pitch_max      = 0.0


    # -- Speech rate + silence metrics ---------------------------------------
    # librosa.effects.split returns intervals of non-silent audio.
    # Gaps between those intervals are pauses.
    voiced_intervals = librosa.effects.split(
        audio,
        top_db     = 20,         # frames below this dB relative to peak are silence
        frame_length = FRAME_LENGTH,
        hop_length   = HOP_LENGTH,
    )

    # Total voiced samples
    voiced_samples = sum(end - start for start, end in voiced_intervals)
    voiced_ratio   = round(voiced_samples / total_frames, 3) if total_frames > 0 else 0.0
    silence_ratio  = round(1.0 - voiced_ratio, 3)

    # Pauses — gaps between voiced intervals
    pause_durations_ms = []
    min_pause_samples  = int((MIN_PAUSE_MS / 1000) * sr)

    for i in range(1, len(voiced_intervals)):
        gap_start  = voiced_intervals[i - 1][1]
        gap_end    = voiced_intervals[i][0]
        gap_samples = gap_end - gap_start

        if gap_samples >= min_pause_samples:
            pause_durations_ms.append(round((gap_samples / sr) * 1000, 1))

    pause_count       = len(pause_durations_ms)
    longest_pause_ms  = round(max(pause_durations_ms), 1) if pause_durations_ms else 0.0


    # -- MFCCs ---------------------------------------------------------------
    # 13 mel-frequency cepstral coefficients — tonal fingerprint of the chunk.
    # We take the mean of each coefficient across all frames.
    mfcc_matrix = librosa.feature.mfcc(
        y          = audio,
        sr         = sr,
        n_mfcc     = N_MFCC,
        hop_length = HOP_LENGTH,
    )
    mfcc = [round(float(v), 4) for v in np.mean(mfcc_matrix, axis=1)]


    return {
        "energy": {
            "rms":        round(rms_mean, 6),
            "normalized": None,           # filled in after all chunks processed
            "peak":       round(rms_peak, 6),
        },
        "pitch": {
            "mean_hz":  pitch_mean,
            "variance": pitch_variance,
            "min_hz":   pitch_min,
            "max_hz":   pitch_max,
        },
        "speech_rate": {
            "voiced_ratio": voiced_ratio,
        },
        "silence": {
            "ratio":            silence_ratio,
            "longest_pause_ms": longest_pause_ms,
            "pause_count":      pause_count,
        },
        "mfcc": mfcc,
    }


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def extract_acoustics(
    chunks:     list[dict],
    chunks_dir: Path,
    sr:         int = SAMPLE_RATE,
) -> list[dict]:
    """
    Run acoustic extraction across all chunks.

    Args:
        chunks     : Scaffold chunk objects from chunk_assembly
        chunks_dir : Directory containing chunk WAV files
        sr         : Sample rate (default 16kHz)

    Returns:
        acoustic_results[i] — one feature dict per chunk, indexed by position
    """

    acoustic_results = []

    # -- Loop 1: extract raw features for every chunk -----------------------
    for chunk in chunks:
        chunk_path = Path(chunk["audio_ref"])

        if not chunk_path.exists():
            logger.warning(f"[acoustic] Missing WAV for {chunk['id']}, skipping")
            acoustic_results.append(None)
            continue

        audio, _ = librosa.load(str(chunk_path), sr=sr, mono=True)
        features  = _extract_chunk(audio, sr)
        acoustic_results.append(features)

        logger.debug(
            f"[acoustic] {chunk['id']} | "
            f"rms: {features['energy']['rms']:.4f} | "
            f"pitch: {features['pitch']['mean_hz']}hz | "
            f"silence: {features['silence']['ratio']:.2f} | "
            f"pauses: {features['silence']['pause_count']}"
        )

    # -- Loop 2: normalize RMS across the full interview --------------------
    # Collect all raw RMS values, find the max, divide each by it.
    # This makes energy scores comparable across chunks.
    rms_values = [
        r["energy"]["rms"]
        for r in acoustic_results
        if r is not None
    ]

    if rms_values:
        rms_max = max(rms_values)
        if rms_max > 0:
            for result in acoustic_results:
                if result is not None:
                    result["energy"]["normalized"] = round(
                        result["energy"]["rms"] / rms_max, 4
                    )

    logger.info(
        f"[acoustic] Extraction complete. "
        f"{len([r for r in acoustic_results if r])} / {len(chunks)} chunks processed"
    )

    return acoustic_results