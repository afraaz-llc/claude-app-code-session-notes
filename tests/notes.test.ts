import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const ID = '11111111-2222-3333-4444-555555555555'
const HOME = '/Users/test'
const FOLDER = `${HOME}/.claude/session-notes`
const NEW_FILE = `${FOLDER}/2026-11-15 Developer ${ID}.md`
const OLD_FILE = `${FOLDER}/2026-11-01 Developer ${ID}.md`

const PANE = {
  plugin: 'session-notes',
  component: 'Pane',
  requestId: 'session-notes',
  props: {
    title: 'Notes',
    isFocused: true,
    bodyColumns: 50,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

type Place = { env?: Record<string, string>; cwd?: string }

// Stands for the engine beneath the plugin: this session's id and folder, a
// clock at noon on 2026-11-15, and a file system in memory.
function world(
  on: On,
  files: Record<string, string> = {},
  { env = { HOME }, cwd = `${HOME}/Developer` }: Place = {},
): Record<string, string> {
  mock.env(on, env)
  mock.clock(on, { now: new Date(2026, 10, 15, 12).getTime() })
  on('session.id', () => ({ value: ID }))
  on('session.cwd', () => ({ value: cwd }))
  on('fs.list', (_, e) => ({
    value: Object.keys(files)
      .filter(path => path.startsWith(`${e.path}/`))
      .map(path => ({
        name: path.slice(e.path.length + 1),
        kind: 'file' as const,
        size: files[path]?.length ?? 0,
        mtimeMs: 0,
        isLink: false,
      })),
  }))
  on('fs.read', (_, e) => {
    const text = files[e.path]
    if (text === undefined) {
      throw new Error(`ENOENT: ${e.path}`)
    }

    return { value: text }
  })
  on('fs.write', (_, e) => {
    files[e.path] = e.text

    return { value: undefined }
  })

  return files
}

test('typing saves to a new file for the session, on every local surface', async ($, on) => {
  const files = world(on)

  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await desktop.find({ type: 'Input', key: 'notes' }))?.props.value).toBe('')
  await desktop.input({ key: 'notes', text: 'call the bank', kind: 'change' })
  await desktop.input({ key: 'notes', text: 'call the bank\nbuy milk', kind: 'change' })
  await desktop.unmount()
  expect(files[NEW_FILE]).toBe('call the bank\nbuy milk')

  // The same session in a terminal picks up where the app left off.
  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await terminal.find({ type: 'Input', key: 'notes' }))?.props.value).toBe(
    'call the bank\nbuy milk',
  )
  await terminal.input({ key: 'notes', text: 'done' })
  await terminal.unmount()
  expect(files[NEW_FILE]).toBe('done')
  expect(Object.keys(files)).toEqual([NEW_FILE])
})

test('notes saved earlier come back, and the widget shows their first line', async ($, on) => {
  world(on, { [OLD_FILE]: '\n  call the bank  \nbuy milk' })

  const docked = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await docked.find({ type: 'Input' }))?.props.value).toBe(
    '\n  call the bank  \nbuy milk',
  )
  await docked.unmount()

  const widget = await $.ui.mount({
    ...PANE,
    surface: 'desktop',
    props: { ...PANE.props, placement: 'widget', anchoredEdges: ['bottom', 'right'] },
  })
  expect((await widget.find({ type: 'Text' }))?.text).toBe('call the bank')
  expect(await widget.find({ type: 'Input' })).toBeUndefined()
  await widget.unmount()
})

test('a phone never receives the notes', async ($, on) => {
  world(on, { [OLD_FILE]: 'door code 1234' })

  const phone = await $.ui.mount({ ...PANE, surface: 'mobile' })
  const drawn = JSON.stringify(await phone.drawn())
  expect(drawn).not.toContain('1234')
  expect(drawn).toContain('stay on your computer')
  await phone.unmount()
})

// The kit resolves paths the way the machine running it does, so a drive
// path can't be tested off Windows: this covers what Windows changes for the
// mod, the home folder in USERPROFILE and a folder path with backslashes.
test('without HOME, as on Windows, the notes go under USERPROFILE', async ($, on) => {
  const files = world(
    on,
    {},
    { env: { USERPROFILE: `${HOME}\\` }, cwd: 'C:\\Users\\test\\Projects\\my app' },
  )

  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await pane.input({ key: 'notes', text: 'hello', kind: 'change' })
  await pane.unmount()
  expect(files).toEqual({ [`${FOLDER}/2026-11-15 my app ${ID}.md`]: 'hello' })
})

const OPEN_PANE = {
  id: 'session-notes',
  title: 'Notes',
  isShown: true,
  isFocused: false,
  isPlaced: true,
}

// The engine beneath session.start and the panes, recording each pane opened.
function starts(on: On, panes: (typeof OPEN_PANE)[] = []): unknown[] {
  const opened: unknown[] = []
  on('command.register', () => ({ value: { command: 'notes' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.panes', () => ({ value: panes }))
  on('ui.open', (_, e) => {
    opened.push(e)

    return { value: { isPlaced: true } }
  })

  return opened
}

const START = { cwd: `${HOME}/Developer`, surface: 'desktop', isInteractive: true } as const

test('a session without notes opens nothing by itself', async ($, on) => {
  world(on, { [`${FOLDER}/2026-11-01 Developer another-session.md`]: 'not mine' })
  const opened = starts(on)

  await $.session.start(START)
  expect(opened).toEqual([])
})

test('a session with notes reopens them small when it starts', async ($, on) => {
  world(on, { [OLD_FILE]: 'something' })
  const opened = starts(on)

  await $.session.start(START)
  expect(opened).toEqual([
    expect.objectContaining({ id: 'session-notes', placement: 'widget' }),
  ])
})

test('blank notes count as none', async ($, on) => {
  world(on, { [OLD_FILE]: '  \n\n ' })
  const opened = starts(on)

  await $.session.start(START)
  expect(opened).toEqual([])
})

test('/notes opens the full pane and adds nothing to the chat', async ($, on) => {
  world(on)
  const opened = starts(on)

  await $.session.start(START)
  const ran = await $.command.run({
    command: 'notes',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 160 },
  })
  expect(ran.text).toBeUndefined()
  expect(opened).toEqual([
    expect.objectContaining({ id: 'session-notes', title: 'Notes', focus: true }),
  ])
})

test('/notes brings a widget back full size', async ($, on) => {
  world(on, { [OLD_FILE]: 'something' })
  const opened = starts(on, [OPEN_PANE])
  const closed: unknown[] = []
  on('ui.close', (_, e) => {
    closed.push(e)

    return { value: undefined }
  })

  await $.session.start(START)
  const widget = await $.ui.mount({
    ...PANE,
    surface: 'desktop',
    props: { ...PANE.props, placement: 'widget', anchoredEdges: [] },
  })
  await widget.unmount()
  await $.command.run({
    command: 'notes',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 160 },
  })
  expect(closed).toEqual([expect.objectContaining({ id: 'session-notes' })])
  expect(opened.at(-1)).toEqual(expect.objectContaining({ focus: true }))
  expect(opened.at(-1)).not.toHaveProperty('placement')
})
