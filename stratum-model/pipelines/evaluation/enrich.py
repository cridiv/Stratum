import asyncio
import logging
from pathlib import Path

import assemblyai as aai
from hume import AsyncHumeClient
from hume.expression_measurement.batch import Models, Prosody
from hume.expression_measurement.batch.types import InferenceBaseRequest

logger = logging.getLogger(__name__)

HUME_CONCURRENCY = 10


# ---------------------------------------------------------------------------
# Part A - Transcript alignment
# ---------------------------------------------------------------------------

def align_transcripts(
    chunks:     list[dict],
    transcript: aai.Transcript,
) -> list[dict | None]:
    """
    For each chunk, extract words from AssemblyAI's word-level data
    that fall within the chunk's (start, end) time window.
    """
    all_words = transcript.words or []

    utterance_sentiments = []
    for u in (transcript.sentiment_analysis or []):
        utterance_sentiments.append({
            "start":     u.start / 1000,
            "end":       u.end   / 1000,
            "sentiment": u.sentiment.value if u.sentiment else None,
        })

    transcript_results = []

    for chunk in chunks:
        chunk_start = chunk["timing"]["start"]
        chunk_end   = chunk["timing"]["end"]

        chunk_words = []
        for w in all_words:
            word_start = w.start / 1000
            word_end   = w.end   / 1000
            if word_start < chunk_end and word_end > chunk_start:
                chunk_words.append({
                    "word":  w.text,
                    "start": round(word_start, 3),
                    "end":   round(word_end,   3),
                })

        text      = " ".join(w["word"] for w in chunk_words).strip()
        sentiment = _dominant_sentiment(chunk_start, chunk_end, utterance_sentiments)

        transcript_results.append({
            "text":      text,
            "words":     chunk_words,
            "sentiment": sentiment,
        })

        logger.debug(
            f"[enrich] {chunk['id']} | "
            f"{len(chunk_words)} words | "
            f"sentiment: {sentiment} | "
            f"\"{text[:60]}{'...' if len(text) > 60 else ''}\""
        )

    logger.info(f"[enrich] Transcript alignment complete. {len(transcript_results)} chunks aligned.")
    return transcript_results


def _dominant_sentiment(
    chunk_start:          float,
    chunk_end:            float,
    utterance_sentiments: list[dict],
) -> str | None:
    best_sentiment = None
    best_overlap   = 0.0

    for u in utterance_sentiments:
        overlap = min(chunk_end, u["end"]) - max(chunk_start, u["start"])
        if overlap > best_overlap:
            best_overlap   = overlap
            best_sentiment = u["sentiment"]

    return best_sentiment


# ---------------------------------------------------------------------------
# Part B - Hume emotion scoring
# ---------------------------------------------------------------------------

async def _score_single_chunk(
    semaphore: asyncio.Semaphore,
    client:    AsyncHumeClient,
    chunk:     dict,
) -> dict | None:
    async with semaphore:
        chunk_path = Path(chunk["audio_ref"])

        if not chunk_path.exists():
            logger.warning(f"[enrich] Hume: missing WAV for {chunk['id']}")
            return None

        try:
            with open(chunk_path, "rb") as f:
                job_id = await client.expression_measurement.batch.start_inference_job_from_local_file(
                    file = [(chunk_path.name, f, "audio/wav")],
                    json = InferenceBaseRequest(models=Models(prosody=Prosody())),
                )

            completed = False
            for _ in range(60):
                details = await client.expression_measurement.batch.get_job_details(id=job_id)
                if details.state.status == "COMPLETED":
                    completed = True
                    break
                elif details.state.status == "FAILED":
                    logger.warning(f"[enrich] Hume job failed for {chunk['id']}")
                    return None
                await asyncio.sleep(2)

            if not completed:
                logger.warning(f"[enrich] Hume job timed out for {chunk['id']}")
                return None

            predictions = await client.expression_measurement.batch.get_job_predictions(id=job_id)
            return _parse_hume_predictions(predictions, chunk["id"])

        except Exception as e:
            logger.warning(f"[enrich] Hume error on {chunk['id']}: {e}")
            return None


def _parse_hume_predictions(predictions: list, chunk_id: str) -> dict | None:
    try:
        prosody = predictions[0].results.predictions[0].models.prosody
        if not prosody:
            return None

        grouped = prosody.grouped_predictions
        if not grouped:
            return None

        emotions_raw = grouped[0].predictions[0].emotions
        scores = {e.name: e.score for e in emotions_raw}

        # Map Hume's 48 emotions to our four dimensions
        confidence      = round((scores.get("Determination",  0.0) + scores.get("Pride",           0.0)) / 2, 4)
        uncertainty     = round((scores.get("Contemplation",  0.0) + scores.get("Realization",     0.0)) / 2, 4)
        distress        = round((scores.get("Distress",       0.0) + scores.get("Disappointment",  0.0) + scores.get("Boredom", 0.0)) / 3, 4)
        positive_affect = round((scores.get("Joy",            0.0) + scores.get("Excitement",      0.0) + scores.get("Satisfaction", 0.0)) / 3, 4)

        emotion_map = {
            "confidence":      confidence,
            "uncertainty":     uncertainty,
            "distress":        distress,
            "positive_affect": positive_affect,
        }
        dominant = max(emotion_map, key=emotion_map.__getitem__)

        return {
            "confidence":      confidence,
            "uncertainty":     uncertainty,
            "distress":        distress,
            "positive_affect": positive_affect,
            "dominant":        dominant,
        }

    except Exception as e:
        logger.warning(f"[enrich] Failed to parse Hume predictions for {chunk_id}: {e}")
        return None


async def _score_all_chunks(
    chunks:  list[dict],
    api_key: str,
) -> list[dict | None]:
    client    = AsyncHumeClient(api_key=api_key)
    semaphore = asyncio.Semaphore(HUME_CONCURRENCY)

    tasks = [
        _score_single_chunk(semaphore, client, chunk)
        for chunk in chunks
    ]

    logger.info(f"[enrich] Submitting {len(tasks)} chunks to Hume (concurrency: {HUME_CONCURRENCY})")
    results = await asyncio.gather(*tasks)
    logger.info(
        f"[enrich] Hume complete. "
        f"{sum(1 for r in results if r)} / {len(results)} chunks scored."
    )
    return list(results)


def score_emotions(
    chunks:  list[dict],
    api_key: str,
) -> list[dict | None]:
    return asyncio.run(_score_all_chunks(chunks, api_key))