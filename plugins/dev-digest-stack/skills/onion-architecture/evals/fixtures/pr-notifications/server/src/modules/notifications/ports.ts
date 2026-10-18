/**
 * Notifications ports. What NotificationsService needs from the outside world,
 * declared next to it: NotificationsRepository implements NotificationsStore;
 * tests pass a fake.
 */

export interface PullTarget {
  prId: string;
  repoId: string;
  owner: string;
  name: string;
  number: number;
}

export interface SummaryFinding {
  severity: 'critical' | 'warning' | 'suggestion';
  title: string;
  file: string;
  startLine: number;
}

export interface NotificationRecord {
  id: string;
  prId: string;
  reviewId: string;
  commentUrl: string;
  createdAt: Date;
}

export interface NotificationsStore {
  findPull(workspaceId: string, prId: string): Promise<PullTarget | undefined>;
  latestReviewFindings(
    workspaceId: string,
    prId: string,
  ): Promise<{ reviewId: string; findings: SummaryFinding[] } | undefined>;
  insert(workspaceId: string, n: Omit<NotificationRecord, 'id' | 'createdAt'>): Promise<NotificationRecord>;
}
