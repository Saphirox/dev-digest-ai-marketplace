// Precomputes semantic-search vectors for every catalog artifact.
// The browser embeds only the query, with the same model, so vectors are comparable.
//
// Usage: node scripts/embed.mjs   (after scripts/build_catalog.py)
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { env, pipeline } from '@huggingface/transformers';
import model from '../src/search/model.json' with { type: 'json' };
import { passageText } from '../src/search/passage.js';

const site = new URL('..', import.meta.url);
const catalogUrl = new URL('public/api/catalog.json', site);
const outUrl = new URL('public/api/embeddings.json', site);
const BATCH = 16;

env.cacheDir = fileURLToPath(new URL('.model-cache/', site));

const catalog = JSON.parse(await readFile(catalogUrl, 'utf8'));
const plugins = new Map(catalog.plugins.map((p) => [p.name, p]));
const texts = catalog.artifacts.map((a) => model.passagePrefix + passageText(a, plugins.get(a.plugin)));

const extractor = await pipeline('feature-extraction', model.id, { dtype: model.dtype });
const vectors = [];
for (let i = 0; i < texts.length; i += BATCH) {
  const output = await extractor(texts.slice(i, i + BATCH), { pooling: 'mean', normalize: true });
  for (const row of output.tolist()) vectors.push(row.map((x) => Math.round(x * 1e5) / 1e5));
}

const result = {
  model: model.id,
  dtype: model.dtype,
  dim: vectors[0]?.length ?? 0,
  ids: catalog.artifacts.map((a) => a.id),
  vectors,
};
await writeFile(outUrl, JSON.stringify(result) + '\n');
console.log(`Embeddings: ${vectors.length} x ${result.dim} (${model.id}) -> ${fileURLToPath(outUrl)}`);
