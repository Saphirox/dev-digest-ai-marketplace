import type { InferSelectModel } from 'drizzle-orm';
import type { Label } from '@devdigest/shared';
import type { labels } from '../../db/schema/labels.js';
import { DEFAULT_LABEL_COLOR, HEX_COLOR, MAX_LABEL_NAME } from './constants.js';

export type LabelRow = InferSelectModel<typeof labels>;

/** Trim, collapse inner whitespace, cap the length. */
export function normalizeLabelName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, MAX_LABEL_NAME);
}

/** A valid `#rrggbb` color in lower case, or the default one. */
export function normalizeColor(color: string | undefined): string {
  return color && HEX_COLOR.test(color) ? color.toLowerCase() : DEFAULT_LABEL_COLOR;
}

export function toLabelDto(row: LabelRow): Label {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    created_at: row.createdAt.toISOString(),
  };
}
