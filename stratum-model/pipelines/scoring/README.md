# Stratum — Scoring

Evaluation pipeline for scoring Stratum's output against a ground truth JSON.
Computes six metrics across transcription, diarization, topic detection, and sentiment.

---

## Files

| File | Responsibility |
|---|---|
| `alignment.py` | Loads files, cleans text, maps speaker labels, builds aligned sequences |
| `metrics.py` | Pure scoring functions — no I/O, just math |
| `score.py` | Orchestrator — calls alignment, calls metrics, prints results |

---

## Metrics

### WER — Word Error Rate
Measures transcription accuracy. Concatenates all ground truth text and all
pipeline transcript text into two strings, strips punctuation, and computes
word error rate using `jiwer`. Counts substitutions, deletions, and insertions
divided by total reference word count.
**Lower is better. 0.0 = perfect.**

### DER — Diarization Error Rate
Measures speaker identification accuracy. Both sides are converted to positional
anonymous labels in order of first appearance — `speaker_1`, `speaker_2` etc. —
so scoring is speaker-agnostic and works on any recording regardless of speaker
names. Counts utterances where the predicted speaker label doesn't match ground
truth.
**Lower is better. 0.0 = perfect.**

### NMI — Normalized Mutual Information
Measures how well predicted topic clusters align with ground truth topic labels.
Pipeline topic clusters are derived from speaker turns — a speaker change is
treated as a proxy for a topic shift. Ground truth topic labels are used as the
reference. NMI measures the statistical dependency between the two clusterings.
**Range 0–1. Higher is better.**

### C_v — Topic Coherence
Measures whether the keywords within each detected topic naturally co-occur in
the corpus. Ground truth topic labels are used to group utterances. Top 8 keywords
per topic are extracted by frequency. Gensim's CoherenceModel computes C_v using
a sliding window PMI approach over the full corpus. Does not require ground truth
topic labels at inference time — only uses them to group texts for evaluation.
**Range 0–1. Higher is better.**

### WindowDiff + Pk — Topic Boundary Detection
Both metrics measure how accurately the pipeline detects where one topic ends
and another begins. Ground truth boundaries come from `topic_change: true` flags.
Pipeline boundaries come from speaker changes. A sliding window of size k (half
the average ground truth segment length) scans both sequences and counts
disagreements. WindowDiff counts windows where boundary counts differ. Pk counts
windows where the two sides disagree on whether any boundary exists inside.
**Both range 0–1. Lower is better.**

### Macro-F1 — Sentiment Classification
Measures sentiment classification accuracy across three classes: positive,
negative, and neutral. Ground truth `mixed` labels are mapped to `neutral`
since the pipeline only outputs three classes. F1 is computed independently
per class and then averaged equally — this prevents a model that always
predicts the dominant class from scoring well.
**Range 0–1. Higher is better.**

---

## How It Runs

Scoring is integrated into the main pipeline orchestrator. When you pass a
ground truth path to `run_pipeline.py`, scoring runs automatically after the
pipeline completes and the output is saved.

```bash
# Pipeline + scoring in one command
python run_pipeline.py audio.mp4 assemblyai_key hume_key ground_truth.json
```

To run scoring independently on an existing pipeline output:

```bash
python score.py ground_truth.json pipeline_output.json
```

---

## Output

```
=======================================================
  UNDERTONE - EVALUATION SCORES
=======================================================

  WER          (lower is better)  :  0.1823
    ref words  : 312
    hyp words  : 308

  DER          (lower is better)  :  0.1500
    correct    : 17 / 20

  NMI          (higher is better) :  0.6241

  C_v          (higher is better) :  0.5814

  WindowDiff   (lower is better)  :  0.3125
  Pk           (lower is better)  :  0.2500
    window k         : 1
    gt boundaries    : 7
    hyp boundaries   : 13

  Macro-F1     (higher is better) :  0.5933
    positive   : 0.6667
    negative   : 0.5714
    neutral    : 0.5417

=======================================================
```

---

## Speaker Label Approach

AssemblyAI returns anonymous speaker labels — `speaker_a`, `speaker_b` etc.
The ground truth uses named labels — CEO, CFO, Analyst (Morgan Stanley), etc.

Rather than hardcoding a name-to-label mapping that only works for this specific
recording, both sides are converted to positional labels in order of first
appearance before DER is computed:

```
Ground truth first appearance:   Pipeline first appearance:
  CEO         → speaker_1          speaker_a → speaker_1
  CFO         → speaker_2          speaker_b → speaker_2
  Analyst MS  → speaker_3          speaker_c → speaker_3
  Analyst GS  → speaker_4          speaker_d → speaker_4
```

This means DER measures whether the pipeline correctly separates speakers
from each other — not whether it knows their names. This is the correct
evaluation for a general-purpose diarization system.

---
