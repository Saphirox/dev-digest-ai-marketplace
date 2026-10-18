# Conflict summaries

**Good** (three sentences, each with a reference, ends in a decision):

> `server/src/modules/reviews/service.ts:88-104` conflicts because main's
> `a1b2c3d` moved cost persistence into `run-executor.ts`, while this branch's
> `e4f5a6b` still writes it inline in the service. Both sides set `usage.cost`,
> so keeping either silently drops the other's rounding rule. Which do you want:
> main's executor-based write, or the inline write?

**Bad**: "There are conflicts in a few files, please check." (no reference, no
cause, no decision) — or a paragraph per file (not three sentences).
