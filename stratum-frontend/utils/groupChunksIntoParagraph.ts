export interface ChunkInput {
  id: string;
  text: string;
}

export async function groupChunksIntoParagraphs(
  chunks: ChunkInput[],
  apiKey: string,
): Promise<string[][]> {
  // Build a numbered list so the model can reference chunks by index.
  const numbered = chunks
    .map((c, i) => `[${i}] ${c.text.trim()}`)
    .join("\n");

  const systemPrompt = `You are a transcript formatter. You will receive a list of transcript utterance chunks, each prefixed with an index like [0], [1], [2], etc.

Your ONLY job is to group consecutive chunks that belong to the same natural paragraph - based on semantic flow, topic continuity, and natural speech pacing.

STRICT RULES:
- Do NOT change, rephrase, or reorder any words.
- Do NOT skip any chunks. Every chunk must appear in exactly one group.
- Groups must be consecutive - you cannot reorder chunks.
- Return ONLY valid JSON: an array of arrays of integers (the chunk indices).
- No explanation, no markdown, no extra text. Only the raw JSON array.

Example output format:
[[0,1,2],[3,4],[5,6,7,8],[9]]`;

  const userPrompt = `Here are the transcript chunks:\n\n${numbered}\n\nGroup them into paragraphs. Return only the JSON array of index arrays.`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  const raw: string = data.choices?.[0]?.message?.content ?? "";

  // Strip any accidental markdown fences.
  const cleaned = raw.replace(/```json|```/gi, "").trim();

  let indexGroups: number[][];
  try {
    indexGroups = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse OpenAI response as JSON:\n${cleaned}`);
  }

  // Validate: flat set of indices must cover [0..chunks.length-1] exactly.
  const flat = indexGroups.flat();
  if (flat.length !== chunks.length) {
    throw new Error(
      `Grouping returned ${flat.length} indices but expected ${chunks.length}`,
    );
  }

  // Map index groups -> chunk ID groups.
  return indexGroups.map((group) => group.map((i) => chunks[i].id));
}
