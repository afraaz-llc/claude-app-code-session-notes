# session-notes

A private notepad for each Claude Code session.

Type `/notes` and a notepad opens beside the chat. Every session gets its own, saved as you type to a
plain Markdown file on your computer. What you write is never added to the conversation, so Claude
doesn't read it unless you ask it to open the file, and the mod makes no network requests.

## Install

You need a recent version of Claude Code. This is a mod (a plugin with a hooks module), an
early-access Claude Code feature. Tested on macOS with Claude Code 2.1.325.

**Claude desktop app:** click **+** next to the prompt box, then **Plugins**, then **Add marketplace**
with `afraaz-llc/claude-app-code-session-notes`, then **Add plugin**.

**Terminal**, at the prompt of a Claude Code session:

```
/plugin install session-notes --marketplace afraaz-llc/claude-app-code-session-notes
```

**Shell:**

```bash
claude plugin install session-notes --marketplace afraaz-llc/claude-app-code-session-notes
```

## Using it

- `/notes` opens the notepad. It works while Claude is in the middle of a reply, too.
- Your text is saved as you type. Enter also saves; Shift+Enter starts a new line.
- A session that already has notes opens them again when it starts, as a small widget where the app
  has widgets.
- Notes are kept in `~/.claude/session-notes/` (on Windows, `%USERPROFILE%\.claude\session-notes\`),
  one file per session, named `<date> <folder> <session id>.md`. Open them in any text editor.

## Privacy

- Notes are written only to your own disk, and the mod makes no network requests.
- They never go into the conversation, so Claude doesn't see them unless you ask it to open the file.
- Where a session is shown somewhere other than your computer, such as the Claude mobile app through
  Remote Control, the notepad shows a placeholder instead of your notes.

## Development

`hooks/register.tsx` is the whole mod and `tests/notes.test.ts` holds its tests. Check changes with
`claude plugin validate .` and `claude plugin test .`, using a Claude Code new enough to read mods.

## License

MIT. See [LICENSE](LICENSE).
