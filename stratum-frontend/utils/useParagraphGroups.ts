import { useState, useEffect, useRef } from "react";
import {
  groupChunksIntoParagraphs,
  ChunkInput,
} from "./groupChunksIntoParagraph";

export interface ParagraphGroupsState {
  groups: string[][] | null;
  loading: boolean;
  error: string | null;
}

export function useParagraphGroups(
  chunks: ChunkInput[],
  apiKey: string
): ParagraphGroupsState {
  const [state, setState] = useState<ParagraphGroupsState>({
    groups: null,
    loading: true,
    error: null,
  });

  // Stable ref to avoid re-firing on every render
  const calledRef = useRef(false);

  useEffect(() => {
    if (!chunks.length) {
      setState({ groups: [], loading: false, error: null });
      calledRef.current = false;
      return;
    }

    if (!apiKey) {
      // Fallback: deterministic grouping when no API key is configured.
      setState({
        groups: chunks.map((chunk) => [chunk.id]),
        loading: false,
        error: null,
      });
      calledRef.current = false;
      return;
    }

    if (calledRef.current) return;
    calledRef.current = true;

    setState({ groups: null, loading: true, error: null });

    groupChunksIntoParagraphs(chunks, apiKey)
      .then((groups) => setState({ groups, loading: false, error: null }))
      .catch((err: Error) => {
        console.error("[useParagraphGroups]", err);
        // Graceful fallback: every chunk is its own paragraph
        setState({
          groups: chunks.map((c) => [c.id]),
          loading: false,
          error: err.message,
        });
      });
  }, [chunks, apiKey]);

  return state;
}