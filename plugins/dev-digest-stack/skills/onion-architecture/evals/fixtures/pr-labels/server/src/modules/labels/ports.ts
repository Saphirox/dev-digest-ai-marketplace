/**
 * Labels ports. What LabelsService needs from the outside world, declared
 * next to it: LabelsRepository implements LabelsStore; tests pass a fake.
 */

export interface LabelRecord {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
  createdAt: Date;
}

export interface NewLabel {
  name: string;
  color: string;
}

export interface LabelsStore {
  find(workspaceId: string, id: string): Promise<LabelRecord | undefined>;
  findByName(workspaceId: string, name: string): Promise<LabelRecord | undefined>;
  insert(workspaceId: string, label: NewLabel): Promise<LabelRecord>;
  update(workspaceId: string, id: string, patch: Partial<NewLabel>): Promise<LabelRecord | undefined>;
  delete(workspaceId: string, id: string): Promise<boolean>;
}
