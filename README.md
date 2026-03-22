# Stratum — Pipeline Overview

Audio-native interview analyzer. Extracts acoustic, emotional, and semantic
intelligence from interview recordings. The transcript tells you what was said.
Undertone tells you how it was said.

---

## What's Been Built

### Pipeline Modules (`pipeline/`)

| File | Step | What it does |
|---|---|---|
| `ingestion.py` | 1 | Accepts audio or video, strips audio via FFmpeg if needed, normalizes to 16kHz mono WAV using librosa |
| `segmentation.py` | 2 | RMS energy analysis to detect silence boundaries, slices audio into chunk WAV files |
| `transcribe.py` | 3 | Single AssemblyAI call — transcription, speaker diarization, sentiment, topic detection |
| `chunk_assembly.py` | 4 | Builds scaffold chunk objects with timing, speaker assignment, and audio_ref |
| `acoustic.py` | 5 | librosa feature extraction per chunk — energy, pitch, speech rate, silence, MFCCs |
| `enrich.py` | 6 | Transcript alignment (word-level) + Hume AI async emotion scoring |
| `fusion.py` | 7 | Merges all results, computes interview-relative signal distributions, derives boolean flags |
| `orchestrator.py` | — | Orchestrator — runs all steps end to end, returns complete chunk array |

---

## The Chunk

Every piece of output the pipeline produces is organized around the chunk —
one sentence of speech defined by natural pause boundaries. The final chunk
object looks like this:

```json
{
  "id": "chunk_004",
  "interview_id": "interview_001",
  "index": 4,
  "transcript": {
    "text": "I thought the decision was... the right call, ultimately.",
    "words": [{"word": "I", "start": 12.44, "end": 12.51}, "..."],
    "sentiment": "POSITIVE"
  },
  "timing": {
    "start": 12.44,
    "end": 16.72,
    "duration": 4.28
  },
  "speaker": {
    "id": "speaker_a",
    "confidence": 0.94,
    "crosstalk": false
  },
  "acoustic": {
    "energy": {"rms": 0.042, "normalized": 0.31, "peak": 0.078},
    "pitch": {"mean_hz": 143.2, "variance": 28.6, "min_hz": 98.4, "max_hz": 210.1},
    "speech_rate": {"voiced_ratio": 0.74},
    "silence": {"ratio": 0.26, "longest_pause_ms": 540, "pause_count": 2},
    "mfcc": [-312.4, 82.1, -14.3, "...13 values"]
  },
  "emotion": {
    "confidence": 0.21,
    "uncertainty": 0.18,
    "distress": 0.04,
    "positive_affect": 0.09,
    "dominant": "confidence"
  },
  "embedding": null,
  "audio_ref": "sessions/interview_001/chunks/chunk_004.wav",
  "flags": {
    "hesitation_detected": true,
    "energy_drop": true,
    "pitch_instability": false,
    "crosstalk_detected": false
  }
}
```

---

## Technology Stack

| Concern | Tool |
|---|---|
| Audio processing | librosa, FFmpeg, soundfile |
| Transcription | AssemblyAI (`universal-3-pro`) |
| Speaker diarization | AssemblyAI (built into transcription call) |
| Sentiment per utterance | AssemblyAI (built into transcription call) |
| Topic detection | AssemblyAI IAB categories |
| Emotion scoring | Hume AI Expression Measurement (prosody model) |
| Acoustic features | librosa (RMS, piptrack, MFCCs, effects.split) |

---

## Running the Pipeline

### Full pipeline (one command)
```bash
python orchestrator.py <audio_or_video_file> <assemblyai_key> <hume_key>
```

---

## Evaluation Metrics Coverage

| Metric | What covers it |
|---|---|
| WER — transcription accuracy | AssemblyAI `universal-3-pro` |
| DER — speaker diarization error | AssemblyAI `speaker_labels=True`, `speakers_expected=4` |
| NMI — topic cluster alignment | AssemblyAI `iab_categories=True` |
| C_v — topic coherence | AssemblyAI IAB categories |
| WindowDiff / Pk — boundary detection | Topic segment boundaries from AssemblyAI |
| Macro-F1 — sentiment | AssemblyAI `sentiment_analysis=True` per utterance |

---

## What's Next

- **Step 9 — Pattern Detector**: cross-chunk analysis, energy trajectory,
  emotion trends, hesitation clustering, final audit object per interview
- **API Layer**: FastAPI endpoints — `POST /analyze`, `GET /chunk/{id}/audio`
- **Frontend**: Next.js document view with flag-derived visual treatment
  and inline audio playback per chunk

---
