import logging
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

FRAME_LENGTH    = 512          # samples per RMS frame (~32ms at 16kHz)
HOP_LENGTH      = 160          # samples between frames (~10ms at 16kHz)
SILENCE_THRESH  = 0.02         # RMS below this is considered silence (tunable)
MIN_SILENCE_MS  = 300          # minimum silence duration to count as a boundary
MIN_CHUNK_MS    = 1_000        # discard chunks shorter than 1 second


# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------

def segment(
    normalized_path: Path,
    chunks_dir:      Path,
    sample_rate:     int = 16_000,
) -> list[tuple[float, float]]:
    """
    Segment a normalized WAV into chunks based on silence boundaries.

    Returns an ordered list of (start_sec, end_sec) pairs.
    Writes chunk_000.wav, chunk_001.wav ... into chunks_dir.
    """

    # -- 1. Load the normalized audio ----------------------------------------
    # We load the full array into memory once.
    # All slicing and feature extraction reads from this single array.
    audio, sr = librosa.load(str(normalized_path), sr=sample_rate, mono=True)
    total_samples = len(audio)
    total_duration = total_samples / sr
    logger.info(f"[segmentation] Loaded {total_duration:.2f}s of audio ({total_samples:,} samples)")


    # -- 2. Compute RMS energy frame by frame --------------------------------
    # librosa.feature.rms slides a window of FRAME_LENGTH samples across the
    # audio, stepping HOP_LENGTH samples each time.
    # Each frame gets one RMS value — the energy of that window.
    # The result is a 1D array: one value per frame, covering the full recording.
    rms = librosa.feature.rms(
        y           = audio,
        frame_length= FRAME_LENGTH,
        hop_length  = HOP_LENGTH,
    )[0]  # shape is (1, n_frames) — we take [0] to get the flat array

    logger.info(f"[segmentation] RMS computed across {len(rms)} frames")


    # -- 3. Convert frame indices to time ------------------------------------
    # Each frame index maps to a time in seconds.
    # librosa.frames_to_time does this conversion using hop_length and sr.
    frame_times = librosa.frames_to_time(
        np.arange(len(rms)),
        sr         = sr,
        hop_length = HOP_LENGTH,
    )


    # -- 4. Build a boolean silence mask -------------------------------------
    # Any frame whose RMS falls below SILENCE_THRESH is marked True (silent).
    # This gives us a frame-by-frame map of where silence lives.
    silence_mask = rms < SILENCE_THRESH


    # -- 5. Detect silence regions that meet the minimum duration ------------
    # A single silent frame is ~10ms — not a real pause.
    # We need contiguous silent frames that add up to at least MIN_SILENCE_MS.
    # 
    # Strategy: scan the mask for runs of True values.
    # When a run ends, check if its duration meets the minimum.
    # If yes, record the midpoint of that silence region as a boundary.

    min_silence_frames = int((MIN_SILENCE_MS / 1000) * sr / HOP_LENGTH)
    boundaries = []   # list of times (seconds) where chunk splits happen

    in_silence   = False
    silence_start = 0

    for i, is_silent in enumerate(silence_mask):
        if is_silent and not in_silence:
            # entering a silence region
            in_silence    = True
            silence_start = i

        elif not is_silent and in_silence:
            # leaving a silence region
            in_silence      = False
            silence_end     = i
            silence_length  = silence_end - silence_start

            if silence_length >= min_silence_frames:
                # long enough — use the midpoint as the split boundary
                mid_frame = (silence_start + silence_end) // 2
                boundaries.append(float(frame_times[mid_frame]))

    # handle case where audio ends while still in silence
    if in_silence:
        silence_end    = len(silence_mask)
        silence_length = silence_end - silence_start
        if silence_length >= min_silence_frames:
            mid_frame = (silence_start + silence_end) // 2
            mid_frame = min(mid_frame, len(frame_times) - 1)
            boundaries.append(float(frame_times[mid_frame]))

    logger.info(f"[segmentation] Found {len(boundaries)} silence boundaries")


    # -- 6. Convert boundaries into (start, end) timestamp pairs -------------
    # boundaries are the split points between chunks.
    # We build the chunk list by treating:
    #   - 0.0 as the start of the first chunk
    #   - each boundary as the end of one chunk and start of the next
    #   - total_duration as the end of the last chunk

    split_points = [0.0] + boundaries + [total_duration]
    raw_segments = [
        (split_points[i], split_points[i + 1])
        for i in range(len(split_points) - 1)
    ]


    # -- 7. Filter out chunks that are too short -----------------------------
    # Very short chunks (< MIN_CHUNK_MS) are usually artifacts of the silence
    # detector firing on a breath or a click, not a real speech boundary.
    # We discard them rather than passing garbage to downstream pipelines.

    min_chunk_sec = MIN_CHUNK_MS / 1000
    segments = [
        (start, end)
        for start, end in raw_segments
        if (end - start) >= min_chunk_sec
    ]

    discarded = len(raw_segments) - len(segments)
    if discarded:
        logger.warning(f"[segmentation] Discarded {discarded} chunks shorter than {MIN_CHUNK_MS}ms")

    logger.info(f"[segmentation] {len(segments)} chunks after filtering")


    # -- 8. Slice audio and write chunk WAV files ----------------------------
    # For each (start, end) pair, convert seconds to sample indices,
    # slice the audio array, and write to disk as a WAV file.
    # Files are named chunk_000.wav, chunk_001.wav, etc.
    # The index is zero-padded to 3 digits so they sort correctly.

    chunks_dir.mkdir(parents=True, exist_ok=True)

    for idx, (start, end) in enumerate(segments):
        start_sample = int(start * sr)
        end_sample   = int(end   * sr)

        # clamp to array bounds — floating point can push end_sample 1 past the end
        end_sample = min(end_sample, total_samples)

        chunk_audio = audio[start_sample:end_sample]
        chunk_path  = chunks_dir / f"chunk_{idx:03d}.wav"

        sf.write(str(chunk_path), chunk_audio, sr, subtype="PCM_16")
        logger.debug(f"[segmentation] Written {chunk_path.name} | {start:.2f}s → {end:.2f}s | {end - start:.2f}s")

    logger.info(f"[segmentation] All chunks written to: {chunks_dir}")

    return segments