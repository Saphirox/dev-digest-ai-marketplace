import type { BriefStore, BriefRecord } from './ports.js';
import type { Resolver } from '../_shared/resolver.js';
import type { ReviewsService } from '../reviews/service.js';
import { ApiFailure } from '../../platform/errors.js';

export interface GetPrBriefInput {
  repo: string;
  pr: number;
}

export interface GetPrBriefResult {
  pr: string;
  brief: BriefRecord | null;
  findingCount: number | null;
}

export interface BriefServiceDeps {
  store: BriefStore;
  resolver: Resolver;
  reviews: Pick<ReviewsService, 'getFindings'>;
}

/** `brief` service. Constructor takes a named deps type, like the other modules' services. */
export class BriefService {
  constructor(private readonly deps: BriefServiceDeps) {}

  /** `get_pr_brief` — the PR's precomputed brief plus how many findings its reviews have. Read-only. */
  async getPrBrief(input: GetPrBriefInput): Promise<GetPrBriefResult> {
    const { store, resolver, reviews } = this.deps;
    const repo = await resolver.resolveRepo(input.repo);
    const prId = await resolver.resolvePr(input.repo, repo.id, input.pr);
    const prLabel = `${repo.full_name}#${input.pr}`;

    let brief: BriefRecord | null;
    try {
      brief = await store.getBrief(prId);
    } catch (err) {
      if (err instanceof ApiFailure && err.status === 404) resolver.invalidatePr(input.repo, input.pr);
      throw err;
    }

    const findings = await reviews.getFindings({ repo: input.repo, pr: input.pr, detail: 'summary' });
    const findingCount = findings.status === 'done' ? findings.counts.critical + findings.counts.warning + findings.counts.suggestion : null;
    return { pr: prLabel, brief, findingCount };
  }
}
