import type { Digest } from '@devdigest/shared';
import { MAX_FINDINGS_PER_REVIEW, MAX_SUMMARY_CHARS } from './constants.js';
import type { DigestRecord } from './ports.js';

export interface DigestInputReview {
  agentName: string;
  findings: { severity: string; title: string; file: string; line: number }[];
}

export function buildDigestMessages(prTitle: string, reviews: DigestInputReview[]) {
  const body = reviews
    .map((r) => {
      const lines = r.findings
        .slice(0, MAX_FINDINGS_PER_REVIEW)
        .map((f) => `- [${f.severity}] ${f.title} (${f.file}:${f.line})`);
      return `## ${r.agentName}\n${lines.join('\n') || '- no findings'}`;
    })
    .join('\n\n');
  return [
    {
      role: 'system' as const,
      content: 'Summarize the review findings below for the PR author: what to fix first, in at most 8 bullets.',
    },
    { role: 'user' as const, content: `PR: ${prTitle}\n\n${body}` },
  ];
}

export function clampSummary(text: string): string {
  const s = text.trim();
  return s.length > MAX_SUMMARY_CHARS ? `${s.slice(0, MAX_SUMMARY_CHARS - 1)}…` : s;
}

export function toDigestDto(r: DigestRecord): Digest {
  return {
    id: r.id,
    pr_id: r.prId,
    summary: r.summary,
    review_count: r.reviewCount,
    model: r.model,
    created_at: r.createdAt.toISOString(),
  };
}
