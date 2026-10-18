import MiniSearch from 'minisearch';
import type { Artifact, ArtifactType, Catalog } from '../types';

// Filler words in English and Ukrainian queries ("I need a skill for...", "Мені треба скіл для...").
const STOP_WORDS = new Set(
  (
    'a an the i me my we you it is are be to of for in on at by with and or that this which what how can could ' +
    'need want looking something some please help use using do does make get find tool plugin ' +
    'мені мене я ми нам треба потрібно потрібен потрібна потрібні хочу шукаю для щоб який яка яке які що як ' +
    'це цей ця у в на з із до та і й або чи можна будь ласка якийсь щось інструмент плагін'
  ).split(' '),
);

// Words that name an artifact type. They boost that type instead of being searched as text.
const TYPE_WORDS: Record<string, ArtifactType> = {
  skill: 'skill', skills: 'skill', скіл: 'skill', скіла: 'skill', скіли: 'skill', скілл: 'skill', навичка: 'skill', навичку: 'skill',
  agent: 'agent', agents: 'agent', subagent: 'agent', агент: 'agent', агента: 'agent', агенти: 'agent', субагент: 'agent',
  command: 'command', commands: 'command', команда: 'command', команду: 'command', команди: 'command',
  hook: 'hook', hooks: 'hook', хук: 'hook', хуки: 'hook', хука: 'hook',
  mcp: 'mcp', server: 'mcp', сервер: 'mcp',
};

export function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

export interface ParsedQuery {
  terms: string[];
  typeHint: ArtifactType | null;
}

export function parseQuery(query: string): ParsedQuery {
  let typeHint: ArtifactType | null = null;
  const terms: string[] = [];
  for (const token of tokenize(query)) {
    if (TYPE_WORDS[token]) typeHint ??= TYPE_WORDS[token];
    else if (token.length > 1 && !STOP_WORDS.has(token)) terms.push(token);
  }
  return { terms, typeHint };
}

export interface KeywordHit {
  id: string;
  score: number;
  terms: string[];
}

export function buildKeywordIndex(catalog: Catalog): MiniSearch<Artifact> {
  const plugins = new Map(catalog.plugins.map((p) => [p.name, p]));
  const index = new MiniSearch<Artifact>({
    fields: ['name', 'description', 'trigger', 'topics', 'plugin', 'body'],
    storeFields: [],
    tokenize,
    processTerm: (term) => (term.length > 1 && !STOP_WORDS.has(term) ? term : null),
    extractField: (doc, field) => {
      if (field === 'name') return doc.name.replace(/[-_:]/g, ' ');
      if (field === 'topics') {
        const p = plugins.get(doc.plugin);
        return [...(p?.tags ?? []), ...(p?.keywords ?? []), p?.category ?? ''].join(' ');
      }
      return String((doc as unknown as Record<string, unknown>)[field] ?? '');
    },
  });
  index.addAll(catalog.artifacts);
  return index;
}

export function keywordSearch(index: MiniSearch<Artifact>, terms: string[]): KeywordHit[] {
  if (terms.length === 0) return [];
  return index
    .search(terms.join(' '), {
      combineWith: 'OR',
      prefix: (term) => term.length > 2,
      fuzzy: (term) => (term.length > 4 ? 0.2 : false),
      boost: { name: 4, description: 3, trigger: 2, topics: 2, plugin: 1.5, body: 1 },
    })
    .map((r) => ({ id: String(r.id), score: r.score, terms: r.queryTerms }));
}
