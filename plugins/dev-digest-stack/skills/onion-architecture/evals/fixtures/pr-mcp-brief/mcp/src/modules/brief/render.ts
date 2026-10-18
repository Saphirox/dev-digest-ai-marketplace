/** Model-facing line rendering for `get_pr_brief` — presentation ring. */
import type { BriefRecord } from './ports.js';
import { sortRisks } from './helpers.js';

export function renderBrief(pr: string, brief: BriefRecord, findingCount: number | null): string {
  const lines = [`${pr}: ${brief.summary}`];
  for (const r of sortRisks(brief.risks)) {
    lines.push(`  [${r.severity}] ${r.title}${r.file ? ` (${r.file})` : ''}`);
  }
  if (findingCount !== null) lines.push(`  review findings so far: ${findingCount}`);
  return lines.join('\n');
}
