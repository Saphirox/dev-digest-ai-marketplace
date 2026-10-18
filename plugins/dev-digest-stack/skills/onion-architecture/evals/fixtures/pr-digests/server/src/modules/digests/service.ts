import OpenAI from 'openai';
import type { Digest, DigestList } from '@devdigest/shared';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { ReviewRepository } from '../reviews/repository.js';
import { DIGEST_MODEL } from './constants.js';
import { buildDigestMessages, clampSummary, toDigestDto } from './helpers.js';
import type { DigestsStore } from './ports.js';

export interface DigestsServiceDeps {
  store: DigestsStore;
  reviews: ReviewRepository;
}

/**
 * PR digests: one short, author-facing summary of every agent review a PR
 * has had so far. Generating one also stamps the PR as digested.
 */
export class DigestsService {
  private openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  constructor(private deps: DigestsServiceDeps) {}

  async generate(workspaceId: string, prId: string): Promise<Digest> {
    const { store, reviews } = this.deps;
    const pull = await reviews.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError(`Pull request ${prId} not found`);

    const history = await reviews.reviewsForPull(prId);
    if (history.length === 0) {
      throw new ValidationError('This PR has no reviews yet: run an agent first, then generate a digest.');
    }

    const messages = buildDigestMessages(
      pull.title,
      history.map(({ review, findings }) => ({
        agentName: review.agentName ?? 'agent',
        findings: findings.map((f) => ({ severity: f.severity, title: f.title, file: f.file, line: f.line })),
      })),
    );
    const completion = await this.openai.chat.completions.create({
      model: DIGEST_MODEL,
      messages,
      temperature: 0.2,
    });
    const summary = clampSummary(completion.choices[0]?.message.content ?? '');

    const digest = await store.insertDigest(workspaceId, {
      prId,
      summary,
      reviewCount: history.length,
      model: DIGEST_MODEL,
    });
    await store.markPullDigested(workspaceId, prId, digest.id);
    return toDigestDto(digest);
  }

  async list(workspaceId: string, prId: string): Promise<DigestList> {
    const pull = await this.deps.reviews.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError(`Pull request ${prId} not found`);
    const rows = await this.deps.store.listForPull(workspaceId, prId);
    return { digests: rows.map(toDigestDto) };
  }
}
