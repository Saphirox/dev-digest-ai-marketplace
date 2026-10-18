import { Octokit } from 'octokit';
import type { NotificationDto, SecretsProvider } from '@devdigest/shared';
import { ConfigError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { DEFAULT_PUBLIC_URL } from './constants.js';
import { buildSummaryComment, toNotificationDto } from './helpers.js';
import type { NotificationsStore } from './ports.js';

export interface NotificationsServiceDeps {
  store: NotificationsStore;
  secrets: SecretsProvider;
}

/**
 * Posts the latest review of a PR as one summary comment on the GitHub PR
 * conversation, and records that it was sent.
 */
export class NotificationsService {
  constructor(private deps: NotificationsServiceDeps) {}

  async notify(workspaceId: string, prId: string): Promise<NotificationDto> {
    const { store, secrets } = this.deps;
    const pull = await store.findPull(workspaceId, prId);
    if (!pull) throw new NotFoundError(`Pull request ${prId} not found`);

    const latest = await store.latestReviewFindings(workspaceId, prId);
    if (!latest) throw new ValidationError('This PR has no review yet: run an agent first.');

    const token = await secrets.get('GITHUB_TOKEN');
    if (!token) throw new ConfigError('GITHUB_TOKEN is not configured');

    const publicUrl = process.env.DEVDIGEST_PUBLIC_URL ?? DEFAULT_PUBLIC_URL;
    const reviewUrl = `${publicUrl}/repos/${pull.repoId}/pulls/${pull.number}`;

    const octokit = new Octokit({ auth: token });
    const { data } = await octokit.rest.issues.createComment({
      owner: pull.owner,
      repo: pull.name,
      issue_number: pull.number,
      body: buildSummaryComment(latest.findings, reviewUrl),
    });

    const record = await store.insert(workspaceId, {
      prId,
      reviewId: latest.reviewId,
      commentUrl: data.html_url,
    });
    return toNotificationDto(record);
  }
}
