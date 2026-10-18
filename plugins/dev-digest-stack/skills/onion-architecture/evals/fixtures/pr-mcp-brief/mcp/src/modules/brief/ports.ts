/**
 * `brief` ports. What `BriefService` needs from the outside world, declared
 * next to the service that uses it: `BriefApiRepository` implements
 * `BriefStore`; tests pass a fake.
 */

export interface BriefRiskRecord {
  title: string;
  severity: 'high' | 'medium' | 'low';
  file?: string;
}

export interface BriefRecord {
  summary: string;
  risks: BriefRiskRecord[];
  generated_at: string;
}

export interface BriefStore {
  /** `GET /pulls/:id/brief` — null until a brief has been generated. */
  getBrief(prId: string): Promise<BriefRecord | null>;
}
