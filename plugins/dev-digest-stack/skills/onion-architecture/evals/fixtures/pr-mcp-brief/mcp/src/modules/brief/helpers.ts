import type { BriefRiskRecord } from './ports.js';

const ORDER: Record<BriefRiskRecord['severity'], number> = { high: 0, medium: 1, low: 2 };

/** Highest severity first; stable within one severity. */
export function sortRisks(risks: BriefRiskRecord[]): BriefRiskRecord[] {
  return [...risks].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}
