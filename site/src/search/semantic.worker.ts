// Runs the embedding model off the main thread. The model is downloaded once and cached by the browser.
import { env, pipeline } from '@huggingface/transformers';
import model from './model.json';

type Request = { type: 'load' } | { type: 'embed'; id: number; text: string };

interface Ctx {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent<Request>) => void) | null;
}
const ctx = self as unknown as Ctx;

env.allowLocalModels = false;

type Extractor = (text: string, options: { pooling: 'mean'; normalize: boolean }) => Promise<{ data: Float32Array }>;
let extractor: Promise<Extractor> | null = null;
const files = new Map<string, { loaded: number; total: number }>();

function load(): Promise<Extractor> {
  extractor ??= pipeline('feature-extraction', model.id, {
    dtype: model.dtype as 'q8',
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status !== 'progress' || !p.file || !p.total) return;
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      ctx.postMessage({ type: 'progress', loaded, total });
    },
  }) as unknown as Promise<Extractor>;
  return extractor;
}

ctx.onmessage = async (event) => {
  const msg = event.data;
  try {
    const embed = await load();
    if (msg.type === 'load') {
      ctx.postMessage({ type: 'ready' });
    } else {
      const output = await embed(model.queryPrefix + msg.text, { pooling: 'mean', normalize: true });
      ctx.postMessage({ type: 'vector', id: msg.id, vector: output.data });
    }
  } catch (err) {
    extractor = null;
    ctx.postMessage({ type: 'error', id: msg.type === 'embed' ? msg.id : undefined, message: String(err) });
  }
};
