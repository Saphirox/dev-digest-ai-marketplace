import type { NotificationDto } from '@devdigest/shared';
import { COMMENT_MARKER, MAX_COMMENT_FINDINGS } from './constants.js';
import type { NotificationRecord, SummaryFinding } from './ports.js';

const RANK: Record<SummaryFinding['severity'], number> = { critical: 0, warning: 1, suggestion: 2 };
const ICON: Record<SummaryFinding['severity'], string> = { critical: '🔴', warning: '🟡', suggestion: '🔵' };

export function buildSummaryComment(findings: SummaryFinding[], reviewUrl: string): string {
  const sorted = [...findings].sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  const shown = sorted.slice(0, MAX_COMMENT_FINDINGS);
  const lines = shown.map((f) => `- ${ICON[f.severity]} **${f.title}** — \`${f.file}:${f.startLine}\``);
  const more = sorted.length - shown.length;
  if (more > 0) lines.push(`- …and ${more} more`);
  const body = lines.length > 0 ? lines.join('\n') : 'No findings. 🎉';
  return `${COMMENT_MARKER}\n### DevDigest review\n\n${body}\n\n[Open the full review](${reviewUrl})`;
}

export function toNotificationDto(r: NotificationRecord): NotificationDto {
  return {
    id: r.id,
    pr_id: r.prId,
    review_id: r.reviewId,
    comment_url: r.commentUrl,
    created_at: r.createdAt.toISOString(),
  };
}
