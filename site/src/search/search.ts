import type MiniSearch from 'minisearch';
import type { Artifact, ArtifactType, Catalog } from '../types';
import { keywordSearch, parseQuery } from './keyword';

export type TypeFilter = ArtifactType | 'all';
export type SortKey = 'relevance' | 'updated' | 'name';

export interface Result {
  artifact: Artifact;
  score: number;
  matched: string[];
  /** Found by meaning only, with no keyword overlap. */
  byMeaning: boolean;
}

export interface SearchOutput {
  results: Result[];
  counts: Record<TypeFilter, number>;
  terms: string[];
}

// Reciprocal rank fusion constant: higher flattens the difference between ranks.
const RRF_K = 60;
// Semantic-only hits are kept when within this distance of the best similarity...
const SEMANTIC_WINDOW = 0.15;
// ...and above this floor. Tuned on paraphrase-multilingual-MiniLM: unrelated text scores below ~0.2,
// relevant Ukrainian/English queries 0.3+.
const SEMANTIC_FLOOR = 0.28;
const TYPE_HINT_BOOST = 1.3;

const TYPES: TypeFilter[] = ['all', 'skill', 'agent', 'command', 'hook', 'mcp', 'plugin'];

export function runSearch(
  catalog: Catalog,
  index: MiniSearch<Artifact>,
  query: string,
  opts: { type: TypeFilter; sort: SortKey; similarity?: Map<string, number> | null },
): SearchOutput {
  const { terms, typeHint } = parseQuery(query);
  const byId = new Map(catalog.artifacts.map((a) => [a.id, a]));
  const scores = new Map<string, Result>();

  if (terms.length === 0 && !opts.similarity) {
    for (const a of catalog.artifacts) {
      if (!typeHint || a.type === typeHint) scores.set(a.id, { artifact: a, score: 0, matched: [], byMeaning: false });
    }
  } else {
    keywordSearch(index, terms).forEach((hit, rank) => {
      const a = byId.get(hit.id);
      if (a) scores.set(a.id, { artifact: a, score: 1 / (RRF_K + rank), matched: hit.terms, byMeaning: false });
    });
    if (opts.similarity) {
      const ranked = [...opts.similarity.entries()].sort((x, y) => y[1] - x[1]);
      const top = ranked[0]?.[1] ?? 0;
      ranked.forEach(([id, sim], rank) => {
        const existing = scores.get(id);
        const a = byId.get(id);
        if (!a) return;
        if (existing) existing.score += 1 / (RRF_K + rank);
        else if (sim >= SEMANTIC_FLOOR && sim >= top - SEMANTIC_WINDOW)
          scores.set(id, { artifact: a, score: 1 / (RRF_K + rank), matched: [], byMeaning: true });
      });
    }
    if (typeHint) for (const r of scores.values()) if (r.artifact.type === typeHint) r.score *= TYPE_HINT_BOOST;
  }

  const all = [...scores.values()];
  const counts = Object.fromEntries(TYPES.map((t) => [t, 0])) as Record<TypeFilter, number>;
  for (const r of all) {
    counts.all++;
    counts[r.artifact.type]++;
  }

  const updated = new Map(catalog.plugins.map((p) => [p.name, p.updatedAt ?? '']));
  const results = all.filter((r) => opts.type === 'all' || r.artifact.type === opts.type);
  const byName = (x: Result, y: Result) => x.artifact.name.localeCompare(y.artifact.name);
  const sort = opts.sort === 'relevance' && terms.length === 0 && !opts.similarity ? 'name' : opts.sort;
  if (sort === 'name') results.sort(byName);
  else if (sort === 'updated')
    results.sort((x, y) => (updated.get(y.artifact.plugin) ?? '').localeCompare(updated.get(x.artifact.plugin) ?? '') || byName(x, y));
  else results.sort((x, y) => y.score - x.score || byName(x, y));

  return { results, counts, terms };
}
