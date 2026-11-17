import type { EngineInterface, Register } from 'claude-code'

// session-notes: a private notepad for each Claude Code session.
//
// /notes opens it: the notes in a box to edit, and under them a box where
// Enter adds a line to the end. What you type is saved as you type, to a
// plain Markdown file on this computer, one per session:
//   ~/.claude/session-notes/<date> <folder> <session id>.md
// The text is never added to the conversation, so Claude doesn't see it
// unless you ask it to open that file, and nothing here uses the network.
// A session that already has notes shows them again, small, when it starts.

const PANE = 'session-notes'
const TITLE = 'Notes'
const PLACEHOLDER = 'Saved locally, not sent anywhere'
const ADD_PLACEHOLDER = 'Enter key only works here. Use Shift+Enter in the field above.'

type Save = { path: string; text: string }

// The file is the record. These only remember, for this load of the module,
// where each session's file is, the newest text typed into it (so a redraw
// while a save is under way never shows older text), and whether the pane
// was last drawn in its small form. A reload starts them over from the file.
const paths = new Map<string, string>()
const drafts = new Map<string, string>()
let queued: Save | undefined
let isSaving = false
let isWidget = false
// What the add box is drawn holding: nothing, so it shows what the person
// typed, or empty just after a line was added from it, which clears it.
let addValue: '' | undefined

// Beside Claude's own files in the home folder: HOME on macOS and Linux,
// USERPROFILE on Windows, whose file calls take forward slashes too.
async function folderOf($: EngineInterface): Promise<string> {
  const home = (await $.env.get('HOME')) || (await $.env.get('USERPROFILE'))
  if (home === undefined || home === '') {
    throw new Error('No home folder is set, so there is nowhere to keep notes')
  }

  return `${home.replace(/[\\/]+$/, '')}/.claude/session-notes`
}

// A file name that reads well in Finder: "2026-11-15 Developer <id>.md".
async function labelOf($: EngineInterface): Promise<string> {
  const now = new Date(await $.clock.now())
  const day = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map(part => String(part).padStart(2, '0'))
    .join('-')
  const cwd = await $.session.cwd()
  const folder = (cwd.split(/[\\/]/).filter(Boolean).pop() ?? '')
    .replace(/[^\w .-]/g, '')
    .slice(0, 40)
    .trim()

  return `${day} ${folder === '' ? 'session' : folder}`
}

// This session's file: the one already saved under its id, else a new one.
async function pathOf($: EngineInterface): Promise<string> {
  const id = await $.session.id()
  const known = paths.get(id)
  if (known !== undefined) {
    return known
  }
  const folder = await folderOf($)
  const entries = await $.fs.list(folder).catch(() => [])
  const saved = entries.find(
    entry => entry.kind === 'file' && entry.name.endsWith(` ${id}.md`),
  )
  const path = `${folder}/${saved?.name ?? `${await labelOf($)} ${id}.md`}`
  paths.set(id, path)

  return path
}

async function textOf($: EngineInterface, path: string): Promise<string> {
  const draft = drafts.get(path)
  if (draft !== undefined) {
    return draft
  }

  return $.fs.read(path).catch(() => '')
}

async function hasNotes($: EngineInterface): Promise<boolean> {
  try {
    return (await textOf($, await pathOf($))).trim() !== ''
  } catch {
    return false
  }
}

// One write at a time, always of the newest text, so the file never ends on
// an older version than the box shows.
async function save($: EngineInterface, path: string, text: string): Promise<void> {
  drafts.set(path, text)
  queued = { path, text }
  if (isSaving) {
    return
  }
  isSaving = true
  try {
    while (queued !== undefined) {
      const job: Save = queued
      queued = undefined
      await $.fs.write(job.path, job.text)
    }
  } catch {
    $.ui.toast("Your notes couldn't be saved to disk. Keep typing to try again.")
  } finally {
    isSaving = false
  }
}

// Adds a line from the add box to the end of the notes, then empties the
// box. A surface keeps what the person typed until the box is drawn holding
// something else, so it is drawn empty, after being drawn as theirs.
async function add($: EngineInterface, path: string, line: string): Promise<void> {
  if (line.trim() === '') {
    return
  }
  const text = await textOf($, path)
  addValue = ''
  const saving = save($, path, text === '' || text.endsWith('\n') ? text + line : `${text}\n${line}`)
  void $.ui.invalidate('ui.render')
  await saving
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'notes',
      description: 'Open a private notepad for this session, saved only on this computer',
      immediate: true,
    })
    if (await hasNotes($)) {
      void $.ui.open({ id: PANE, title: TITLE, placement: 'widget' })
    }

    return next(e)
  })

  on('command.run', { command: 'notes' }, async $ => {
    // A surface reads the seat only when it first shows a pane, so the small
    // form is closed first to open full size.
    const isOpen = (await $.ui.panes()).some(pane => pane.id === PANE)
    if (isOpen && isWidget) {
      await $.ui.close({ id: PANE })
    }
    const opened = await $.ui.open({ id: PANE, title: TITLE, focus: true })

    return opened.isPlaced
      ? {}
      : { text: `The notepad can't be shown here: ${opened.reason}` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Input, Text } = $.ui.resolve(e)
    isWidget = e.props.placement === 'widget'

    // Only the app, a terminal or VS Code on this computer get the text. A
    // phone, or any other surface, reaches the session over the internet.
    const isLocal =
      e.surface === 'desktop' || e.surface === 'terminal' || e.surface === 'vscode'
    if (!isLocal) {
      return (
        <Text dimColor>These notes stay on your computer, so they aren't shown here.</Text>
      )
    }

    const path = await pathOf($)
    const text = await textOf($, path)

    if (isWidget) {
      const first = text
        .split('\n')
        .map(line => line.trim())
        .find(line => line !== '')

      return (
        <Text dimColor={first === undefined} wrap="truncate-end">
          {first ?? 'No notes yet'}
        </Text>
      )
    }

    // Every change is saved as it is typed, so there is no save button. The
    // desktop app and VS Code draw one only for a field given a submitLabel.
    // The terminal draws a key hint instead, "⏎ submit" unless told
    // otherwise, which would read as if the notes were sent somewhere.
    const isTerminal = e.surface === 'terminal'
    const bodyRows = e.props.scroll.bodyRows

    // The boxes fill the pane, so that only the notes scroll, never the pane.
    // The terminal lays them out in whole rows: the notes, a row between, and
    // the add box. In the app the Box around them is the pane's rows tall,
    // its padding inside that, and the add box sits at its bottom. The notes
    // take the rows left less five: their padding, the add box's two lines
    // and padding, and some space between. The padding is the same on every
    // side and gives the focus outline room, a ring and a glow about 8px
    // wide drawn outside a field, which the app cuts off at the pane's edges.
    const rows = Math.min(200, Math.max(3, bodyRows - (isTerminal ? 2 : 5)))
    const layout = isTerminal
      ? ({ gap: 1 } as const)
      : ({
          height: Math.max(bodyRows, rows + 5),
          padding: 'sm',
          justifyContent: 'space-between',
        } as const)

    return (
      <Box flexDirection="column" {...layout}>
        <Input
          key="notes"
          rows={rows}
          value={text}
          placeholder={PLACEHOLDER}
          submitLabel={isTerminal ? 'save' : undefined}
          onInput={value => void save($, path, value)}
          onSubmit={value => {
            // Enter saves too. Drawing again keeps the text in the box on a
            // surface that would empty a field it submitted.
            void save($, path, value).then(() => $.ui.invalidate('ui.render'))
          }}
        />
        <Input
          key="add"
          // The app draws a one-line field only as wide as its own few
          // words, and a field of two lines or more as wide as the pane.
          rows={isTerminal ? 1 : 2}
          value={addValue}
          placeholder={ADD_PLACEHOLDER}
          submitLabel={isTerminal ? 'add' : undefined}
          autoFocus
          onInput={() => {
            // Typing after a line was added: the box is drawn as the person's
            // own again, so that drawing it empty next time clears it.
            if (addValue !== undefined) {
              addValue = undefined
              void $.ui.invalidate('ui.render')
            }
          }}
          onSubmit={value => void add($, path, value)}
        />
      </Box>
    )
  })
}
