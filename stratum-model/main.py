"""
test_diarization.py
--------------------
Test diarization on an existing normalized WAV file.

Usage:
    python test_diarization.py <path_to_normalized.wav> <hf_token>
"""

import sys
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(message)s")

from pipelines.evaluation.diarization import diarize, assign_speaker


def main():
    if len(sys.argv) < 3:
        print("Usage: python test_diarization.py <path_to_normalized.wav> <hf_token>")
        sys.exit(1)

    normalized_path = Path(sys.argv[1])
    hf_token        = sys.argv[2]

    # -- Run diarization
    print("\n--- DIARIZATION ---")
    timeline = diarize(normalized_path, hf_token)

    print(f"\n{len(timeline)} segments detected:\n")
    for seg in timeline:
        duration = seg["end"] - seg["start"]
        print(f"  {seg['speaker_id']}  {seg['start']:7.2f}s → {seg['end']:7.2f}s  ({duration:.2f}s)")

    # -- Test assign_speaker against the first few segments
    # Grab the first 3 chunk-sized windows from the timeline and run assignment
    print("\n--- SPEAKER ASSIGNMENT SPOT CHECK ---\n")
    test_windows = [
        (timeline[i]["start"], timeline[i]["end"])
        for i in range(min(5, len(timeline)))
    ]

    for start, end in test_windows:
        result = assign_speaker(start, end, timeline)
        crosstalk_flag = " [CROSSTALK]" if result["crosstalk"] else ""
        print(
            f"  {start:.2f}s → {end:.2f}s  |  "
            f"{result['speaker_id']}  "
            f"confidence: {result['confidence']:.2f}"
            f"{crosstalk_flag}"
        )


if __name__ == "__main__":
    main()