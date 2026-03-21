## What The Pipeline Does

The pipeline has 9 stages that run in sequence.

**Stage 1 — Ingestion.** If you give it a video, FFmpeg strips the audio track. Then librosa normalizes everything to 16kHz mono — a clean, consistent signal that every downstream stage reads from. Nothing downstream touches the original file.

**Stage 2 — Segmentation.** librosa runs RMS energy analysis across the full recording, scanning for regions where energy drops below a silence threshold for at least 300 milliseconds. Those silence regions become chunk boundaries. The output is an ordered list of timestamps and individual WAV files — `chunk_000.wav`, `chunk_001.wav` and so on. These chunks are the atomic unit of the entire system. Everything else is built around them.

**Stage 3 — Transcription and Diarization.** One AssemblyAI API call handles transcription, speaker diarization, sentiment per utterance, and topic detection simultaneously. It identified all four speakers correctly, returned word-level timestamps for the full transcript, and labeled every utterance with positive, negative, or neutral sentiment.

**Stage 4 — Chunk Assembly.** We cross-reference the chunk timestamps from segmentation against the speaker timeline from AssemblyAI to assign a speaker ID and confidence score to every chunk. This builds the scaffold object — timing, speaker, audio reference — that every later stage fills into.

**Stage 5 — Acoustic Extraction.** librosa processes every chunk WAV locally. For each chunk it extracts RMS energy, pitch mean and variance via piptrack, voiced ratio, silence ratio, pause count, longest pause duration, and 13 MFCC coefficients — the tonal fingerprint of that audio slice. After all chunks are processed, RMS scores are normalized across the full interview so energy is comparable between chunks.

**Stage 6 — Enrichment.** Two things happen here. First, transcript alignment — we scan AssemblyAI's word-level timestamps and pull the words that fall within each chunk's time window, giving every chunk its own text and sentiment. Second, emotion scoring — every chunk WAV is submitted to Hume AI's Expression Measurement API concurrently using asyncio. Hume returns 48 emotion dimensions from the prosody of the audio. We map those down to four dimensions we care about: confidence, uncertainty, distress, and positive affect.

**Stage 7 — Fusion.** Every indexed array comes together here. Acoustic features, transcript, emotion scores, timing, and speaker all merge into one complete object per chunk. Then we compute interview-level signal distributions — percentiles across all 69 chunks — and derive four boolean flags relative to those distributions. `hesitation_detected` fires when silence ratio and pause count are both above the interview median. `energy_drop` fires when a chunk's energy is in the lower quartile of the interview. `pitch_instability` fires when pitch variance is above the 75th percentile. `crosstalk_detected` fires when speaker confidence drops below 0.7. The flags are relative to this specific interview, not hardcoded globally.

**Stage 8 — Pattern Detector.** This is the cross-chunk intelligence layer. It reads across all 69 chunks as a whole and surfaces patterns that only become visible at that scale. It tracks energy trajectory across interview thirds — is the speaker losing steam? It fits a linear trend to emotion scores across chunk indices — is uncertainty rising as the conversation progresses? It measures hesitation concentration — are hesitation flags clustered around a specific topic or spread evenly? It tracks speaker dominance and switch density. It maps the sentiment arc from early to late. The output is one structured audit object with a findings array, each finding referencing the specific chunks it came from.

---

## What The Output Looks Like

Every chunk comes out as a rich JSON object with its transcript text, word-level timestamps, speaker label, full acoustic fingerprint, four emotion scores, boolean flags, and a reference to its audio slice on disk. The pattern detector adds one audit object on top of that covering the full interview.

---

## What This Covers For The Evaluation

The evaluation scores six metrics. AssemblyAI handles transcription accuracy, speaker diarization, topic detection, and sentiment in a single call. Hume handles the acoustic emotion layer. The boundary detection for topic segmentation comes from AssemblyAI's IAB category timestamps. All six metrics are covered by the pipeline output.

---

## The Key Design Decision

The reason AssemblyAI replaced what was originally two separate tools — Groq for transcription and pyannote for diarization — is speed and reliability. pyannote running locally on CPU took over 30 minutes and never completed. AssemblyAI returned transcription, speaker labels, sentiment, and topics for the same file in under 2 minutes. For a hackathon demo, that's the right tradeoff.