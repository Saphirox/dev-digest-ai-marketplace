// Shape of public/api/catalog.json, written by scripts/build_catalog.py.

export type ArtifactType = 'skill' | 'agent' | 'command' | 'hook' | 'mcp' | 'plugin';

export interface Artifact {
  id: string;
  type: ArtifactType;
  name: string;
  plugin: string;
  description: string;
  trigger: string;
  invoke: string;
  url: string | null;
  body: string;
  allowedTools: string[];
}

export interface ChangelogEntry {
  version: string;
  date: string | null;
  body: string;
}

export interface Plugin {
  name: string;
  displayName: string | null;
  description: string;
  category: string | null;
  tags: string[];
  keywords: string[];
  version: string | null;
  author: { name: string; url?: string } | null;
  license: string | null;
  homepage: string | null;
  external: boolean;
  path: string | null;
  updatedAt: string | null;
  readme: string;
  changelog: ChangelogEntry[];
  counts: Partial<Record<ArtifactType, number>>;
  touches: {
    hooks: { event: string; matcher: string; command: string }[];
    mcpServers: { name: string; launch: string }[];
    scripts: string[];
    allowedTools: string[];
  };
}

export interface Catalog {
  schemaVersion: number;
  generatedAt: string;
  marketplace: {
    name: string;
    description: string;
    owner: { name: string; url?: string } | null;
    repo: string;
  };
  plugins: Plugin[];
  artifacts: Artifact[];
}

export interface Embeddings {
  model: string;
  dtype: string;
  dim: number;
  ids: string[];
  vectors: number[][];
}
