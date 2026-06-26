# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Validate all API inputs with Zod — including URL params

- **Context**: src/pages/api/events/[id]/delete.ts (S-03 impl-review F6)
- **Problem**: The delete endpoint consumed `context.params.id` raw without UUID validation, while all field inputs were Zod-validated. This created an inconsistency and, combined with no rows-affected check (F1), could produce a false-success response for a malformed or non-existent ID.
- **Rule**: Every API route handler must validate ALL user-controlled inputs with Zod before any DB or business logic — this includes URL route params (e.g. `z.string().uuid().safeParse(context.params.id)`), not just form/body fields.
- **Applies to**: `src/pages/api/**/*.ts`
