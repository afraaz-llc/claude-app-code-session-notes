# Session Notes

A private notepad for each Claude Code session.

Type `/notes` and a notepad opens beside the chat. Every session gets its own, saved as you type to a
plain Markdown file on your computer. What you write is never added to the conversation, so Claude
doesn't read it unless you ask it to open the file, and the mod makes no network requests.

## Install

You need a recent version of Claude Code. This is a mod (a plugin with a hooks module), an
early-access Claude Code feature. Tested on macOS with Claude Code 2.1.330.

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

- `/notes` opens the notepad with the cursor in it, and running it again puts the cursor back
  there. It opens while Claude is in the middle of a reply, too.
- Type, edit, copy and paste in it as in any text box. Shift+Enter starts a new line; Enter on
  its own only saves, because the app sends a text box's contents when you press Enter.
- In the desktop app, a row under the notepad shows the Shift+Enter hint, a link to this
  repository on GitHub, and an ⓘ that explains how the notepad works and shows the file your notes
  are saved to.
- Every change is saved the moment you make it, so there's no save button.
- In a terminal, Ctrl+X then Tab moves between the prompt and the notepad.
- A session that already has notes opens them again when it starts, as a small widget where the app
  has widgets.
- Notes are kept in `~/.claude/session-notes/` (on Windows, `%USERPROFILE%\.claude\session-notes\`),
  one file per session, named `<date> <folder> <session id>.md`. Open them in any text editor.

## Privacy

- Notes are written only to your own disk, and the mod makes no network requests.
- They never go into the conversation, so Claude doesn't see them unless you ask it to open the file.
- Where a session is shown somewhere other than your computer, such as the Claude mobile app through
  Remote Control, the notepad shows a placeholder instead of your notes.
- On your computer the mod reads and writes files in `~/.claude/session-notes/` and nowhere else. It
  reads the `HOME` variable (`USERPROFILE` on Windows) to find that folder, and it runs no programs or
  commands.
- The only web address in the mod is the GitHub link under the notepad, which opens in your browser
  only when you click it.

## Development

`hooks/register.tsx` is the whole mod and `tests/notes.test.ts` holds its tests. Check changes with
`claude plugin validate .` and `claude plugin test .`, using a Claude Code new enough to read mods.

## License

MIT. See [LICENSE](LICENSE).
