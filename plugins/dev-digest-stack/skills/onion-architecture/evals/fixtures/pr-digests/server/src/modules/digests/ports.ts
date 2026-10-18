/**
 * Digests ports. What DigestsService needs from the outside world, declared
 * next to it: DigestsRepository implements DigestsStore; tests pass a fake.
 */

export interface DigestRecord {
  id: string;
  prId: string;
  summary: string;
  reviewCount: number;
  model: string;
  createdAt: Date;
}

export interface NewDigest {
  prId: string;
  summary: string;
  reviewCount: number;
  model: string;
}

export interface DigestsStore {
  insertDigest(workspaceId: string, digest: NewDigest): Promise<DigestRecord>;
  markPullDigested(workspaceId: string, prId: string, digestId: string): Promise<void>;
  listForPull(workspaceId: string, prId: string): Promise<DigestRecord[]>;
}
