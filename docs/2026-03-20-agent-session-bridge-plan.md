# Agent Session Bridge Plan

## Done

- Local adapters for `codex`, `claude`, `cursor`, `qoder`, `qodercli`
- Current-directory-first session selection
- Two-stage handoff bundle
- Experimental `claude -> codex-session` export
- Thin skill scaffold
- Short CLI routes and shorthand agent names
- First `split` and `fork` workflow support
- `--session-id` lookup and `--json` machine-readable output

## Todo

### Product

- Compress README first screen to one sentence plus 3 commands
- Add one real demo for handoff and one for `codex-session`
- Make the shortest routes the primary documented workflow

### CLI

- Add safer output directory control for exports

### Codex resume export

- Test whether `turn_context` materially improves continuation quality
- Test whether assistant-only / user-only edge cases need special handling
- Decide whether `event_msg` should be emitted for transcript completeness
- Expand beyond `claude` only after real smoke tests pass

### Skill

- Add `agents/openai.yaml`
- Make the skill return structured results, not just prose
- Add one real skill verification scenario

### Cleanup

- Keep `docs/` minimal
- Avoid adding process-heavy notes back into docs
