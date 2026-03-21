"""
undertone / pipelines / evaluation / alignment.py
---------------------------------------------------
Data preparation layer for scoring.

Key design decision — text similarity matching:
  Ground truth has 20 lines (one per speaker turn).
  AssemblyAI may produce a different number of utterances due to
  merging or splitting of turns. Positional alignment (line 0 → utterance 0)
  breaks as soon as counts diverge.

  Instead, each ground truth line is matched to the utterance whose
  text has the highest word overlap (Jaccard similarity). This ensures
  we always compare the right content regardless of count differences.
  Works for any audio file — no hardcoded assumptions.
"""

import json
import re
from collections import defaultdict


# ---------------------------------------------------------------------------
# Loaders
# ---------------------------------------------------------------------------

def load_ground_truth(path: str) -> list[dict]:
    with open(path) as f:
        data = json.load(f)
    return data["lines"]


def load_pipeline_output(path: str) -> dict:
    with open(path) as f:
        return json.load(f)


def get_utterances(pipeline_output: dict) -> list[dict]:
    """
    Extract AssemblyAI utterances from pipeline output.
    Falls back to merging chunks by speaker if utterances key missing.
    """
    if "utterances" in pipeline_output:
        return pipeline_output["utterances"]

    # Fallback: merge consecutive same-speaker chunks
    chunks     = pipeline_output.get("chunks", [])
    utterances = []
    current    = None

    for c in chunks:
        if not c.get("transcript") or not c["transcript"].get("text", "").strip():
            continue
        sid  = c["speaker"]["id"]
        text = c["transcript"]["text"].strip()
        sent = c["transcript"].get("sentiment")

        if current and current["speaker_id"] == sid:
            current["text"] += " " + text
            if sent:
                current["sentiment"] = sent
            current["end"] = c["timing"]["end"]
        else:
            if current:
                utterances.append(current)
            current = {
                "speaker_id": sid,
                "text":       text,
                "sentiment":  sent,
                "start":      c["timing"]["start"],
                "end":        c["timing"]["end"],
            }

    if current:
        utterances.append(current)

    return utterances


# ---------------------------------------------------------------------------
# Text cleaning
# ---------------------------------------------------------------------------

def clean(text: str) -> str:
    return re.sub(r"[^\w\s]", "", text.lower()).strip()


def tokenize(text: str) -> set[str]:
    return set(clean(text).split())


# ---------------------------------------------------------------------------
# Text similarity matching
# ---------------------------------------------------------------------------

def match_utterances_to_ground_truth(
    ground_truth: list[dict],
    utterances:   list[dict],
) -> list[tuple[dict, dict]]:
    """
    Match each ground truth line to the most similar utterance
    using Jaccard word overlap.

    Each utterance can only be matched once — greedy assignment
    in ground truth order.

    Returns:
        List of (gt_line, matched_utterance) pairs
    """
    available = list(range(len(utterances)))
    pairs     = []

    for gt_line in ground_truth:
        gt_tokens = tokenize(gt_line["text"])

        best_idx   = None
        best_score = -1.0

        for i in available:
            hyp_tokens = tokenize(utterances[i]["text"])
            union      = gt_tokens | hyp_tokens
            if not union:
                continue
            score = len(gt_tokens & hyp_tokens) / len(union)
            if score > best_score:
                best_score = score
                best_idx   = i

        if best_idx is not None:
            pairs.append((gt_line, utterances[best_idx]))
            available.remove(best_idx)
        else:
            # No match found — pair with empty utterance
            pairs.append((gt_line, {
                "speaker_id": "unknown",
                "text":       "",
                "sentiment":  None,
                "start":      0.0,
                "end":        0.0,
            }))

    return pairs


# ---------------------------------------------------------------------------
# Speaker label mapping
# ---------------------------------------------------------------------------

def build_speaker_map(utterances: list[dict]) -> dict[str, str]:
    seen, counter = {}, 1
    for u in utterances:
        sid = u["speaker_id"]
        if sid not in seen:
            seen[sid] = f"speaker_{counter}"
            counter += 1
    return seen


def build_gt_speaker_sequence(ground_truth: list[dict]) -> list[str]:
    seen, counter, result = {}, 1, []
    for line in ground_truth:
        spk = line["speaker"]
        if spk not in seen:
            seen[spk] = f"speaker_{counter}"
            counter += 1
        result.append(seen[spk])
    return result


def build_hyp_speaker_sequence(
    utterances:  list[dict],
    speaker_map: dict[str, str],
) -> list[str]:
    return [speaker_map.get(u["speaker_id"], "unknown") for u in utterances]


# ---------------------------------------------------------------------------
# Boundary sequences
# ---------------------------------------------------------------------------

def build_gt_boundary_sequence(ground_truth: list[dict]) -> list[int]:
    return [1 if line.get("topic_change", False) else 0 for line in ground_truth]


def build_hyp_boundary_sequence(utterances: list[dict], n: int) -> list[int]:
    boundaries, prev_speaker = [0] * n, None
    for i, u in enumerate(utterances[:n]):
        sid = u["speaker_id"]
        if i > 0 and sid != prev_speaker:
            boundaries[i] = 1
        prev_speaker = sid
    return boundaries


# ---------------------------------------------------------------------------
# Topic grouping for C_v
# ---------------------------------------------------------------------------

def group_texts_by_topic(
    pairs: list[tuple[dict, dict]],
) -> dict[str, list[list[str]]]:
    """
    Group matched utterance texts by ground truth topic label.
    Takes matched pairs directly so grouping is always aligned.
    """
    topic_texts: dict[str, list[list[str]]] = defaultdict(list)
    for gt_line, utterance in pairs:
        topic  = gt_line["topic"]
        tokens = [w for w in clean(utterance["text"]).split() if len(w) > 3]
        if tokens:
            topic_texts[topic].append(tokens)
    return dict(topic_texts)


# ---------------------------------------------------------------------------
# Sentiment normalization
# ---------------------------------------------------------------------------

def normalize_sentiment(s: str | None) -> str:
    if not s:
        return "neutral"
    s = s.lower().strip()
    return "neutral" if s == "mixed" else s


def build_sentiment_sequences(
    pairs: list[tuple[dict, dict]],
) -> tuple[list[str], list[str]]:
    """
    Build sentiment sequences from matched pairs.
    """
    gt_sentiments  = [normalize_sentiment(gt["sentiment"])  for gt, _   in pairs]
    hyp_sentiments = [normalize_sentiment(hyp.get("sentiment")) for _, hyp in pairs]
    return gt_sentiments, hyp_sentiments