# Repository Instructions

## Agent skills

### Issue tracker

Issues and formal PRDs live in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Domain docs

This is a single-context repository. Read `CONTEXT.md` and relevant ADRs when they exist. See `docs/agents/domain.md`.

### Feature docs

Pre-PRD discussions live at `docs/feature/<release>/<feature-slug>/discussion.md`. See `docs/agents/feature-docs.md`.

### Worktrees

Implementation tasks use isolated worktrees under `.worktrees/<task-slug>`. See `docs/agents/worktrees.md`.

## Repository engineering

- This repository contains the Markdown-based `english-learning` Codex skill. It has no configured build, test, lint, or generation command.
- `SKILL.md` owns the teaching workflow.
- `curriculum/` contains only authored, sequenced formal courses; index every formal lesson in `curriculum/README.md`.
- `references/` owns supporting policies, while `templates/LEARNING.md` defines the initial learner-state structure.
- Keep formal courses separate from agent-generated adaptive reading.
- Root learner-state files are private local data and must remain ignored.
