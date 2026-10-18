import type { FastifyReply } from 'fastify';
import type { Label, LabelCreate, LabelPatch } from '@devdigest/shared';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { normalizeColor, normalizeLabelName, toLabelDto } from './helpers.js';
import type { LabelsStore } from './ports.js';

export interface LabelsServiceDeps {
  store: LabelsStore;
}

/** Workspace labels: create, rename / recolor, delete. Names are unique per workspace. */
export class LabelsService {
  constructor(private deps: LabelsServiceDeps) {}

  async create(workspaceId: string, input: LabelCreate): Promise<Label> {
    const name = normalizeLabelName(input.name);
    if (!name) throw new ValidationError('Label name is empty.');
    if (await this.deps.store.findByName(workspaceId, name)) {
      throw new ValidationError(`Label "${name}" already exists.`);
    }
    const row = await this.deps.store.insert(workspaceId, { name, color: normalizeColor(input.color) });
    return toLabelDto(row);
  }

  async update(workspaceId: string, id: string, patch: LabelPatch, reply: FastifyReply): Promise<Label> {
    const existing = await this.deps.store.find(workspaceId, id);
    if (!existing) {
      return reply.code(404).send({ error: 'not_found', message: `Label ${id} not found` });
    }
    const name = patch.name !== undefined ? normalizeLabelName(patch.name) : undefined;
    if (name !== undefined && !name) throw new ValidationError('Label name is empty.');
    if (name && name !== existing.name && (await this.deps.store.findByName(workspaceId, name))) {
      throw new ValidationError(`Label "${name}" already exists.`);
    }
    const color = patch.color !== undefined ? normalizeColor(patch.color) : undefined;
    const row = await this.deps.store.update(workspaceId, id, { name, color });
    return toLabelDto(row!);
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    const deleted = await this.deps.store.delete(workspaceId, id);
    if (!deleted) throw new NotFoundError(`Label ${id} not found`);
  }
}
