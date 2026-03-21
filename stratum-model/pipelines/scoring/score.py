"""
undertone / pipelines / evaluation / score.py
----------------------------------------------
Scoring orchestrator.

Usage:
    python score.py <ground_truth.json> <pipeline_output.json>
"""

import sys
import logging

from alignment import (
    load_ground_truth,
    load_pipeline_output,
    get_utterances,
    clean,
    match_utterances_to_ground_truth,
    build_speaker_map,
    build_gt_speaker_sequence,
    build_hyp_speaker_sequence,
    build_gt_boundary_sequence,
    build_hyp_boundary_sequence,
    group_texts_by_topic,
    build_sentiment_sequences,
)
from metrics import (
    compute_wer,
    compute_der,
    compute_nmi,
    compute_cv,
    compute_boundaries,
    compute_macro_f1,
)

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)


def run_all(ground_truth_path: str, pipeline_output_path: str) -> dict:

    # -- Load
    ground_truth    = load_ground_truth(ground_truth_path)
    pipeline_output = load_pipeline_output(pipeline_output_path)
    utterances      = get_utterances(pipeline_output)
    n               = len(ground_truth)

    logger.info(f"Ground truth lines : {len(ground_truth)}")
    logger.info(f"Utterances         : {len(utterances)}")

    # -- Match each ground truth line to best utterance by text similarity
    pairs = match_utterances_to_ground_truth(ground_truth, utterances)

    # Extract aligned sequences from pairs
    gt_lines      = [gt  for gt, _   in pairs]
    matched_utts  = [hyp for _,  hyp in pairs]

    # -- Speaker sequences
    speaker_map  = build_speaker_map(utterances)
    gt_speakers  = build_gt_speaker_sequence(gt_lines)
    hyp_speakers = build_hyp_speaker_sequence(matched_utts, speaker_map)

    # -- Text sequences for WER
    ref_texts = [clean(gt["text"])          for gt  in gt_lines]
    hyp_texts = [clean(u.get("text", ""))   for u   in matched_utts]

    # -- Topic sequences for NMI
    gt_topics  = [gt["topic"] for gt in gt_lines]
    hyp_topics = []
    current_topic_idx, prev_speaker = 0, None
    for u in matched_utts:
        sid = u["speaker_id"]
        if sid != prev_speaker and prev_speaker is not None:
            current_topic_idx += 1
        hyp_topics.append(f"topic_{current_topic_idx}")
        prev_speaker = sid

    # -- Topic texts for C_v
    topic_texts = group_texts_by_topic(pairs)

    # -- Boundary sequences
    ref_boundaries = build_gt_boundary_sequence(gt_lines)
    hyp_boundaries = build_hyp_boundary_sequence(matched_utts, n)

    # -- Sentiment sequences
    gt_sentiments, hyp_sentiments = build_sentiment_sequences(pairs)

    # -- Compute all metrics
    wer_result      = compute_wer(ref_texts, hyp_texts)
    der_result      = compute_der(gt_speakers, hyp_speakers)
    nmi_result      = compute_nmi(gt_topics, hyp_topics)
    cv_result       = compute_cv(topic_texts)
    boundary_result = compute_boundaries(ref_boundaries, hyp_boundaries)
    f1_result       = compute_macro_f1(gt_sentiments, hyp_sentiments)

    # -- Print
    print("\n" + "=" * 55)
    print("  UNDERTONE - EVALUATION SCORES")
    print("=" * 55)
    print(f"\n  WER          (lower is better)  :  {wer_result['wer']}")
    print(f"    ref words  : {wer_result['ref_word_count']}")
    print(f"    hyp words  : {wer_result['hyp_word_count']}")
    print(f"\n  DER          (lower is better)  :  {der_result['der']}")
    print(f"    correct    : {der_result['correct']} / {der_result['total_utterances']}")
    print(f"\n  NMI          (higher is better) :  {nmi_result['nmi']}")
    print(f"\n  C_v          (higher is better) :  {cv_result['cv']}")
    print(f"\n  WindowDiff   (lower is better)  :  {boundary_result['windowdiff']}")
    print(f"  Pk           (lower is better)  :  {boundary_result['pk']}")
    print(f"    gt boundaries  : {boundary_result['ref_boundaries']}")
    print(f"    hyp boundaries : {boundary_result['hyp_boundaries']}")
    print(f"\n  Macro-F1     (higher is better) :  {f1_result['macro_f1']}")
    print(f"    positive   : {f1_result['per_class']['positive']}")
    print(f"    negative   : {f1_result['per_class']['negative']}")
    print(f"    neutral    : {f1_result['per_class']['neutral']}")
    print("\n" + "=" * 55 + "\n")

    return {
        "wer":        wer_result,
        "der":        der_result,
        "nmi":        nmi_result,
        "cv":         cv_result,
        "boundaries": boundary_result,
        "macro_f1":   f1_result,
    }


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python score.py <ground_truth.json> <pipeline_output.json>")
        sys.exit(1)
    run_all(sys.argv[1], sys.argv[2])