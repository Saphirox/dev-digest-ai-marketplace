import { useCallback, useEffect, useRef, useState } from 'react';
import type { Embeddings } from '../types';
import model from './model.json';

export type SemanticStatus =
  | { state: 'off' }
  | { state: 'unavailable'; reason: string }
  | { state: 'loading'; loaded: number; total: number }
  | { state: 'ready' }
  | { state: 'error'; message: string };

export interface SemanticIndex {
  ids: string[];
  vectors: Float32Array[];
}

async function fetchEmbeddings(): Promise<SemanticIndex | null> {
  const res = await fetch(`${import.meta.env.BASE_URL}api/embeddings.json`);
  if (!res.ok) return null;
  const data = (await res.json()) as Embeddings;
  if (data.model !== model.id) return null;
  return { ids: data.ids, vectors: data.vectors.map((v) => Float32Array.from(v)) };
}

/** Cosine similarity of the (normalized) query vector against every artifact vector. */
export function similarities(index: SemanticIndex, query: Float32Array): Map<string, number> {
  const out = new Map<string, number>();
  index.vectors.forEach((v, i) => {
    let dot = 0;
    for (let k = 0; k < v.length; k++) dot += v[k] * query[k];
    out.set(index.ids[i], dot);
  });
  return out;
}

/**
 * Loads the artifact vectors and the query model when `enabled`, and embeds queries.
 * The worker is created once and kept for the session.
 */
export function useSemantic(enabled: boolean) {
  const [status, setStatus] = useState<SemanticStatus>({ state: 'off' });
  const [index, setIndex] = useState<SemanticIndex | null>(null);
  const worker = useRef<Worker | null>(null);
  const pending = useRef(new Map<number, (v: Float32Array | null) => void>());
  const nextId = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setStatus({ state: 'off' });
      return;
    }
    let cancelled = false;
    (async () => {
      const idx = index ?? (await fetchEmbeddings().catch(() => null));
      if (cancelled) return;
      if (!idx) {
        setStatus({ state: 'unavailable', reason: 'The semantic index was not built for this deployment.' });
        return;
      }
      setIndex(idx);
      if (!worker.current) {
        const w = new Worker(new URL('./semantic.worker.ts', import.meta.url), { type: 'module' });
        w.onmessage = (e: MessageEvent) => {
          const msg = e.data;
          if (msg.type === 'progress') setStatus({ state: 'loading', loaded: msg.loaded, total: msg.total });
          else if (msg.type === 'ready') setStatus({ state: 'ready' });
          else if (msg.type === 'vector') {
            pending.current.get(msg.id)?.(msg.vector);
            pending.current.delete(msg.id);
          } else if (msg.type === 'error') {
            setStatus({ state: 'error', message: msg.message });
            if (msg.id !== undefined) {
              pending.current.get(msg.id)?.(null);
              pending.current.delete(msg.id);
            }
          }
        };
        worker.current = w;
      }
      setStatus((s) => (s.state === 'ready' ? s : { state: 'loading', loaded: 0, total: 0 }));
      worker.current.postMessage({ type: 'load' });
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => () => worker.current?.terminate(), []);

  const embed = useCallback((text: string): Promise<Float32Array | null> => {
    const w = worker.current;
    if (!w) return Promise.resolve(null);
    const id = nextId.current++;
    return new Promise((resolve) => {
      pending.current.set(id, resolve);
      w.postMessage({ type: 'embed', id, text });
    });
  }, []);

  return { status, index, embed };
}
