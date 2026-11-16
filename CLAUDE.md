# claude-app-code-session-notes

This repo is the Claude Code mod **session-notes**: `/notes` opens a private notepad pane beside the
chat, one per session, saved as you type to `~/.claude/session-notes/<date> <folder> <session id>.md`.
It is public at https://github.com/afraaz-llc/claude-app-code-session-notes, and people install it
with `/plugin install session-notes --marketplace afraaz-llc/claude-app-code-session-notes`.

## Layout

- `hooks/register.tsx`: the whole mod, one hooks module. `hooks/hooks.json` names it.
- `tests/notes.test.ts`: the tests, run by `claude plugin test .`.
- `.claude-plugin/plugin.json`: the manifest. `.claude-plugin/marketplace.json` makes this repo its
  own marketplace (one entry, `source: "./"`).

## Working on it

- Load the `plugin-authoring` skill before changing code. It writes this build's API types
  (`types/claude-code.d.ts` in the skill's folder) and explains the API, which is early access and
  changes between releases. Read the types; don't guess.
- Edit the files here, in place. On the dev machine this folder is installed as a local directory
  marketplace, so `/reload-plugins` loads an edit. Don't also copy the mod into the skill's
  per-session mods folder: it would load twice.
- Check every change with a Claude Code new enough to read mods: `claude plugin validate .` and
  `claude plugin test .`. If the `claude` on your PATH is older (validate says `hooks: expected
  record`), use the Claude desktop app's bundled engine, the newest
  `~/Library/Application Support/Claude/claude-code/<version>/<id>/claude.app/Contents/MacOS/claude`.
- Type-check with `tsc` and the tsconfig in the types file's header, kept outside this folder, its
  `include` naming the types file, `hooks` and `tests`.
- `plugin validate` refuses `$` passed to a helper unless the helper is a top-level function of the
  file, so module state and helpers live at the top level, not inside `register`.

## Rules

- Privacy is the point. The text never goes into the conversation, the mod makes no network calls,
  and any surface that isn't local (desktop, terminal, vscode) gets a placeholder, never the notes.
- Never open a real notes folder while developing; the tests use the kit's mocks.
- Changing where notes are saved, or how their files are named, strands everyone's existing notes.
  Keep the scheme, or ship a migration with the change.
- Release by committing to `main` and pushing, with a `version` bump in `plugin.json` for anything
  users should pick up.
