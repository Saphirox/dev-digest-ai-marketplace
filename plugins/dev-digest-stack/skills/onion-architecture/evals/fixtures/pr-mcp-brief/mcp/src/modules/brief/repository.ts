import { z } from 'zod';
import type { BriefRecord, BriefStore } from './ports.js';
import { DevDigestApiClient, parseObject } from '../../adapters/devdigest-api/client.js';

/** `brief` data-access layer — owns the response zod schema + `safeParse` for `GET /pulls/:id/brief`. */

const RiskSchema = z
  .object({
    title: z.string(),
    severity: z.enum(['high', 'medium', 'low']),
    file: z.string().optional(),
  })
  .passthrough();

const BriefSchema = z
  .object({
    summary: z.string(),
    risks: z.array(RiskSchema),
    generated_at: z.string(),
  })
  .passthrough();

export class BriefApiRepository implements BriefStore {
  constructor(private readonly client: DevDigestApiClient) {}

  async getBrief(prId: string): Promise<BriefRecord | null> {
    const body = await this.client.get(`/pulls/${encodeURIComponent(prId)}/brief`);
    if (body === null) return null;
    return parseObject<BriefRecord>(BriefSchema, body, 'GET /pulls/:id/brief');
  }
}
