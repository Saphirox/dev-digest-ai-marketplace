import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { LabelRecord, LabelsStore, NewLabel } from './ports.js';

/** Labels data access. Every query is workspace-scoped. */
export class LabelsRepository implements LabelsStore {
  constructor(private db: Db) {}

  async find(workspaceId: string, id: string): Promise<LabelRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.labels)
      .where(and(eq(t.labels.workspaceId, workspaceId), eq(t.labels.id, id)));
    return row;
  }

  async findByName(workspaceId: string, name: string): Promise<LabelRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.labels)
      .where(and(eq(t.labels.workspaceId, workspaceId), eq(t.labels.name, name)));
    return row;
  }

  async insert(workspaceId: string, label: NewLabel): Promise<LabelRecord> {
    const [row] = await this.db
      .insert(t.labels)
      .values({ workspaceId, ...label })
      .returning();
    return row!;
  }

  async update(workspaceId: string, id: string, patch: Partial<NewLabel>): Promise<LabelRecord | undefined> {
    const [row] = await this.db
      .update(t.labels)
      .set(patch)
      .where(and(eq(t.labels.workspaceId, workspaceId), eq(t.labels.id, id)))
      .returning();
    return row;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.labels)
      .where(and(eq(t.labels.workspaceId, workspaceId), eq(t.labels.id, id)))
      .returning({ id: t.labels.id });
    return rows.length > 0;
  }
}
