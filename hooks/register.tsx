import type { EngineInterface, Register } from 'claude-code'

// session-notes: a private notepad for each Claude Code session.
//
// /notes opens it: the notes in one box to edit, with the cursor in it. What
// you type is saved as you type, to a plain Markdown file on this computer,
// one per session:
//   ~/.claude/session-notes/<date> <folder> <session id>.md
// The text is never added to the conversation, so Claude doesn't see it
// unless you ask it to open that file, and nothing here uses the network.
// A session that already has notes shows them again, small, when it starts.

const PANE = 'session-notes'
const TITLE = 'Notes'
// Where the app's notepad links to; it opens only when the person clicks it.
const REPO = 'https://github.com/afraaz-llc/claude-app-code-session-notes'

type Save = { path: string; text: string }

// The file is the record. These only remember, for this load of the module,
// where each session's file is, the newest text typed into it (so a redraw
// while a save is under way never shows older text), whether the pane was
// last drawn in its small form, and whether the app shows the note about the
// notepad in place of the notes. A reload starts them over from the file.
const paths = new Map<string, string>()
const drafts = new Map<string, string>()
let queued: Save | undefined
let isSaving = false
let isWidget = false
let isInfoShown = false

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

// How long /notes waits each time before asking for the keyboard again.
const ASK_AGAIN_MS = [100, 250, 500]

// Puts the cursor in the notes once the pane holds the keyboard. /notes asks
// for the keyboard as it opens the pane, but the app hands it over only while
// the prompt box is empty, which it may not be until the command has run. So
// this asks again for under a second, then moves the cursor to the notes.
async function focusNotes($: EngineInterface): Promise<void> {
  for (const wait of [...ASK_AGAIN_MS, undefined]) {
    const pane = (await $.ui.panes()).find(open => open.id === PANE)
    if (pane === undefined || !pane.isPlaced) {
      return
    }
    if (pane.isFocused) {
      await $.ui.focus({ requestId: PANE, key: 'notes' })
      return
    }
    if (wait === undefined) {
      return
    }
    await $.clock.sleep(wait)
    await $.ui.open({ id: PANE, title: TITLE, focus: true })
  }
}

// Swaps the notes for the note about the notepad, or back, and on the way
// back puts the cursor in the notes again.
async function showInfo($: EngineInterface, isShown: boolean): Promise<void> {
  isInfoShown = isShown
  await $.ui.invalidate('ui.render')
  if (!isShown) {
    await $.ui.focus({ requestId: PANE, key: 'notes' })
  }
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
    // /notes always shows the notes, even if the note about them was up.
    if (isInfoShown) {
      isInfoShown = false
      void $.ui.invalidate('ui.render')
    }
    const opened = await $.ui.open({ id: PANE, title: TITLE, focus: true })
    if (!opened.isPlaced) {
      return { text: `The notepad can't be shown here: ${opened.reason}` }
    }
    // Not awaited: the prompt box lets go of the keyboard only once this
    // command has finished.
    void focusNotes($).catch(() => undefined)

    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Input, Link, Text } = $.ui.resolve(e)
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
    const isDesktop = e.surface === 'desktop'
    const bodyRows = e.props.scroll.bodyRows

    // In the app a row along the bottom holds the Shift+Enter hint, a link to
    // the repository and an ⓘ that swaps the notes for a note about them.
    const footer = isDesktop && (
      <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap="sm">
        <Text dimColor wrap="truncate-end">
          Shift+Enter to create a new line
        </Text>
        <Box flexDirection="row" alignItems="center" gap="sm">
          <Link href={REPO} label="GitHub" />
          <Button
            key="info"
            plain
            dimColor
            onPress={() => void showInfo($, !isInfoShown).catch(() => undefined)}
          >
            ⓘ
          </Button>
        </Box>
      </Box>
    )

    // The terminal gives the notes every row. The app takes three rows for the
    // row along the bottom and the padding (two left the box running past the
    // pane's bottom on 2.1.330); VS Code, which draws no such row, two.
    const rows = Math.min(200, Math.max(3, bodyRows - (isTerminal ? 0 : isDesktop ? 3 : 2)))

    // The Box is the pane's rows tall (a percentage height isn't honoured
    // there), and the box and the row under it sit at its top and bottom,
    // inside a padding that is even on every side and gives the focus outline
    // room (a ring and a glow drawn outside a field, which the app cuts off at
    // the pane's edges). What the box's lines leave over goes between the two:
    // the apps measure a pane in rows of their code font, which don't match
    // the box's lines, so the box can't fill the pane to the pixel.
    const layout = {
      height: Math.max(bodyRows, rows + 3),
      padding: 'xs',
      justifyContent: 'space-between',
    } as const

    if (isDesktop && isInfoShown) {
      return (
        <Box flexDirection="column" {...layout}>
          <Box flexDirection="column" gap="sm">
            <Text bold>Session Notes</Text>
            <Text>
              A private notepad for this session. Each session has its own, and
              its notes come back when the session opens again.
            </Text>
            <Text>
              Shift+Enter creates a new line. Enter on its own only saves: the
              app sends a text box's contents when you press Enter, and a plugin
              can't change that.
            </Text>
            <Text>
              Your notes stay on this computer. They're saved as you type to the
              file below and never sent to Claude or anywhere online, so Claude
              only sees them if you ask it to open the file. On a phone, through
              Remote Control, the notepad shows a note in their place.
            </Text>
            <Text dimColor>{path}</Text>
            <Text dimColor>Made by Afraaz LLC · MIT license</Text>
            <Box alignSelf="flex-start">
              <Button key="back" onPress={() => void showInfo($, false).catch(() => undefined)}>
                Back to notes
              </Button>
            </Box>
          </Box>
          {footer}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" {...(isTerminal ? {} : layout)}>
        <Input
          key="notes"
          rows={rows}
          value={text}
          submitLabel={isTerminal ? 'save' : undefined}
          autoFocus
          onInput={value => void save($, path, value)}
          onSubmit={value => {
            // Enter saves too. Drawing again keeps the text in the box on a
            // surface that would empty a field it submitted.
            void save($, path, value).then(() => $.ui.invalidate('ui.render'))
          }}
        />
        {footer}
      </Box>
    )
  })
}
