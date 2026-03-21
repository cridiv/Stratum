"""
undertone / pipelines / evaluation / metrics.py
-------------------------------------------------
Pure scoring functions. No file I/O. No data loading.
Every function takes pre-aligned data and returns a score dict.

Metrics:
  - WER         Word Error Rate
  - DER         Diarization Error Rate
  - NMI         Normalized Mutual Information (topic clustering)
  - C_v         Topic Coherence
  - WindowDiff  Topic boundary detection
  - Pk          Topic boundary detection
  - Macro-F1    Sentiment classification
"""

import logging
from collections import defaultdict

import numpy as np
from sklearn.metrics import normalized_mutual_info_score, f1_score
from sklearn.preprocessing import LabelEncoder
from jiwer import wer
from gensim.models.coherencemodel import CoherenceModel
from gensim.corpora import Dictionary

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 1. WER — Word Error Rate
# ---------------------------------------------------------------------------

def compute_wer(
    ref_texts: list[str],
    hyp_texts: list[str],
) -> dict:
    """
    Concatenate all reference and hypothesis texts, compute WER
    over the full transcript.

    Args:
        ref_texts : Ground truth utterance texts (cleaned)
        hyp_texts : Pipeline utterance texts (cleaned)

    Returns:
        wer, ref_word_count, hyp_word_count
        Lower is better. 0.0 = perfect.
    """
    ref = " ".join(ref_texts)
    hyp = " ".join(hyp_texts)

    score = round(wer(ref, hyp), 4)

    return {
        "wer":            score,
        "ref_word_count": len(ref.split()),
        "hyp_word_count": len(hyp.split()),
    }


# ---------------------------------------------------------------------------
# 2. DER — Diarization Error Rate
# ---------------------------------------------------------------------------

def compute_der(
    gt_speakers:  list[str],
    hyp_speakers: list[str],
) -> dict:
    """
    Utterance-level speaker confusion rate.
    Both sequences use positional anonymous labels (speaker_1, speaker_2...)
    so scoring is speaker-agnostic.

    Args:
        gt_speakers  : Ground truth speaker sequence (positional labels)
        hyp_speakers : Pipeline speaker sequence (positional labels)

    Returns:
        der, correct, total_utterances
        Lower is better. 0.0 = perfect.
    """
    n       = min(len(gt_speakers), len(hyp_speakers))
    correct = sum(1 for g, h in zip(gt_speakers[:n], hyp_speakers[:n]) if g == h)
    der     = round(1.0 - (correct / n), 4) if n > 0 else 1.0

    return {
        "der":              der,
        "correct":          correct,
        "total_utterances": n,
    }


# ---------------------------------------------------------------------------
# 3. NMI — Normalized Mutual Information
# ---------------------------------------------------------------------------

def compute_nmi(
    gt_topics:  list[str],
    hyp_topics: list[str],
) -> dict:
    """
    Measure how well predicted topic clusters align with ground truth topics.

    Args:
        gt_topics  : Ground truth topic label per utterance
        hyp_topics : Pipeline topic cluster label per utterance

    Returns:
        nmi, gt_topic_list, hyp_topic_count
        Range 0–1. Higher is better.
    """
    n = min(len(gt_topics), len(hyp_topics))

    le_gt  = LabelEncoder()
    le_hyp = LabelEncoder()

    gt_encoded  = le_gt.fit_transform(gt_topics[:n])
    hyp_encoded = le_hyp.fit_transform(hyp_topics[:n])

    score = round(float(normalized_mutual_info_score(gt_encoded, hyp_encoded)), 4)

    return {
        "nmi":             score,
        "gt_topics":       list(set(gt_topics)),
        "hyp_topic_count": len(set(hyp_topics)),
    }


# ---------------------------------------------------------------------------
# 4. C_v — Topic Coherence
# ---------------------------------------------------------------------------

def compute_cv(topic_texts: dict[str, list[list[str]]]) -> dict:
    """
    Compute C_v topic coherence using gensim CoherenceModel.

    Measures whether the top keywords within each topic cluster
    naturally co-occur in the corpus.

    Args:
        topic_texts : {topic_label: [tokenized utterance, ...]}
                      Output of alignment.group_texts_by_topic()

    Returns:
        cv, topic_count
        Range 0–1. Higher is better.
    """
    all_texts: list[list[str]] = []
    for texts in topic_texts.values():
        all_texts.extend(texts)

    if not all_texts or len(topic_texts) < 2:
        return {"cv": 0.0, "note": "insufficient data for coherence scoring"}

    # Top 8 words per topic by frequency
    topics_word_lists = []
    for topic, texts in topic_texts.items():
        freq: dict[str, int] = defaultdict(int)
        for tokens in texts:
            for t in tokens:
                freq[t] += 1
        top_words = sorted(freq, key=freq.__getitem__, reverse=True)[:8]
        if top_words:
            topics_word_lists.append(top_words)

    if not topics_word_lists:
        return {"cv": 0.0, "note": "no topic word lists built"}

    dictionary = Dictionary(all_texts)

    try:
        cm    = CoherenceModel(
            topics     = topics_word_lists,
            texts      = all_texts,
            dictionary = dictionary,
            coherence  = "c_v",
        )
        score = round(float(cm.get_coherence()), 4)
    except Exception as e:
        logger.warning(f"[metrics] C_v computation failed: {e}")
        score = 0.0

    return {
        "cv":          score,
        "topic_count": len(topics_word_lists),
    }


# ---------------------------------------------------------------------------
# 5 + 6. WindowDiff + Pk — Topic boundary detection
# ---------------------------------------------------------------------------

def compute_windowdiff(
    ref: list[int],
    hyp: list[int],
    k:   int,
) -> float:
    """
    WindowDiff metric. Counts windows where ref and hyp
    disagree on the number of boundaries inside.
    Lower is better. 0.0 = perfect.
    """
    n      = len(ref)
    errors = 0
    for i in range(n - k):
        if sum(ref[i:i + k]) != sum(hyp[i:i + k]):
            errors += 1
    return round(errors / (n - k), 4) if (n - k) > 0 else 1.0


def compute_pk(
    ref: list[int],
    hyp: list[int],
    k:   int,
) -> float:
    """
    Pk metric. Counts windows where ref and hyp disagree
    on whether a boundary exists anywhere inside.
    Lower is better. 0.0 = perfect.
    """
    n      = len(ref)
    errors = 0
    for i in range(n - k):
        ref_same = (sum(ref[i:i + k]) == 0)
        hyp_same = (sum(hyp[i:i + k]) == 0)
        if ref_same != hyp_same:
            errors += 1
    return round(errors / (n - k), 4) if (n - k) > 0 else 1.0


def compute_boundaries(
    ref_boundaries: list[int],
    hyp_boundaries: list[int],
) -> dict:
    """
    Compute both WindowDiff and Pk.
    k is set to half the average ground truth segment length.

    Args:
        ref_boundaries : Ground truth boundary sequence (0/1 per utterance)
        hyp_boundaries : Pipeline boundary sequence (0/1 per utterance)

    Returns:
        windowdiff, pk, k, ref_boundary_count, hyp_boundary_count
        Lower is better. 0.0 = perfect.
    """
    n              = min(len(ref_boundaries), len(hyp_boundaries))
    ref            = ref_boundaries[:n]
    hyp            = hyp_boundaries[:n]
    num_boundaries = max(sum(ref), 1)
    avg_seg_len    = n / num_boundaries
    k              = max(1, int(avg_seg_len / 2))

    return {
        "windowdiff":      compute_windowdiff(ref, hyp, k),
        "pk":              compute_pk(ref, hyp, k),
        "k":               k,
        "ref_boundaries":  sum(ref),
        "hyp_boundaries":  sum(hyp),
    }


# ---------------------------------------------------------------------------
# 7. Macro-F1 — Sentiment classification
# ---------------------------------------------------------------------------

def compute_macro_f1(
    gt_sentiments:  list[str],
    hyp_sentiments: list[str],
) -> dict:
    """
    Compute Macro-F1 over positive, negative, neutral classes.
    F1 computed per class then averaged equally — prevents a model
    that always predicts one class from scoring well.

    Args:
        gt_sentiments  : Ground truth sentiment labels (normalized)
        hyp_sentiments : Pipeline sentiment labels (normalized)

    Returns:
        macro_f1, per_class breakdown
        Range 0–1. Higher is better.
    """
    labels = ["positive", "negative", "neutral"]
    n      = min(len(gt_sentiments), len(hyp_sentiments))

    macro_f1 = round(float(f1_score(
        gt_sentiments[:n],
        hyp_sentiments[:n],
        labels        = labels,
        average       = "macro",
        zero_division = 0,
    )), 4)

    per_class = f1_score(
        gt_sentiments[:n],
        hyp_sentiments[:n],
        labels        = labels,
        average       = None,
        zero_division = 0,
    )

    return {
        "macro_f1": macro_f1,
        "per_class": {
            "positive": round(float(per_class[0]), 4),
            "negative": round(float(per_class[1]), 4),
            "neutral":  round(float(per_class[2]), 4),
        },
    }