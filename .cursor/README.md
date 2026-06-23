# Cursor AI configuration

This project uses the [10xDevs AI Toolkit](https://10xdevs.pl) workflow. All AI agent configuration lives under `.cursor/`.

## Skills

Project skills: `.cursor/skills/<name>/SKILL.md`

| How to invoke | Example |
| --- | --- |
| Name the skill in chat | `Implement phase 1 using 10x-implement` |
| Attach the skill file | `@.cursor/skills/10x-implement/SKILL.md` |
| Auto-discovery | Agent reads skills when `description` in frontmatter matches the task |

### Updating skills from the course

Requires Node 20+ (`nvm use`). CLI config: `~/.config/10x-cli/config.json` → `{"tool":"cursor"}`.

```bash
# Refresh already-downloaded lessons
npx @przeprogramowani/10x-cli sync --tool cursor

# Fetch a new lesson
npx @przeprogramowani/10x-cli get m2l5 --tool cursor

# Pull all unlocked lessons (fresh setup)
npx @przeprogramowani/10x-cli sync --all --tool cursor
```

Artifacts land in `.cursor/skills/`, `.cursor/prompts/`, and `.cursor/rules/10x-course.mdc`. Manifest: `.cursor/.10x-cli-manifest.json`.

### Change lifecycle

```
10x-new → 10x-research → 10x-plan → 10x-plan-review → 10x-implement → 10x-impl-review → 10x-archive
```

Active work folders: `context/changes/<change-id>/`. Do not write to `context/archive/`.

### Example prompts

| Goal | Prompt |
| --- | --- |
| Start a change | `Start a new change for edit-event using skill 10x-new` |
| Plan | `Create a plan for s03-edit-or-remove-event using 10x-plan` |
| Implement | `Implement phase 1 of @context/changes/s03-edit-or-remove-event/plan.md using 10x-implement` |
| Review code | `Review the implementation for s03-edit-or-remove-event using 10x-impl-review` |

## Rules

| File | Purpose |
| --- | --- |
| `.cursor/rules/10x-workflow.mdc` | Project workflow router (always on) |
| `.cursor/rules/10x-course.mdc` | Course lesson rules (managed by 10x-cli) |
