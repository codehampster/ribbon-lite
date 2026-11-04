import { expect, mock, test } from 'claude-code/testing'

const NOW = Date.parse('2098-12-31T22:10:00Z')
const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 12,
  bodyColumns: 110,
  scroll: { offset: 0, bodyRows: 12 },
  view: {},
} as const

const seed = async ($: any, on: any) => {
  mock.store(on)
  mock.clock(on, { now: NOW })
  on('session.start', ($: any, e: any) => ({ cwd: e.cwd }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { window: 1000000, tokens: 200000 },
      rateLimits: [{ kind: 'seven_day', percentUsed: 8 }],
      cost: { usd: 3.2 },
    },
  }))
  on('classic.SessionStart', () => ({}))
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 600, context_tokens: 200000, model: 'claude-opus-5-5' })
}

test('clicking the keep-warm toggle opens the picker and a pick sets the deadline', async ($, on) => {
  await seed($, on)
  const band = await $.ui.mount({ plugin: 'ribbon-lite', surface: 'desktop', component: 'AbovePrompt', props: PROPS })

  const toggle = await band.find({ key: 'keep' })
  expect(toggle?.props.label).toBe('○')

  await band.press({ key: 'keep' })
  expect((await band.find({ key: 'keep' }))?.props.label).toBe('×')
  expect(await band.find({ key: 'keep-h' })).toBeDefined()
  expect(await band.find({ key: 'keep-m' })).toBeDefined()

  await band.press({ key: 'keep-4' })
  expect((await band.find({ key: 'keep' }))?.props.label).toMatch(/^◉→\d\d:\d\d$/)
  await band.unmount()
})

test('pressing Keep sets a deadline from the rolled time, and the toggle turns it off', async ($, on) => {
  await seed($, on)
  const band = await $.ui.mount({ plugin: 'ribbon-lite', surface: 'desktop', component: 'AbovePrompt', props: PROPS })

  await band.press({ key: 'keep' })
  await band.press({ key: 'keep-set' })
  expect((await band.find({ key: 'keep' }))?.props.label).toMatch(/^◉→\d\d:\d\d$/)
  expect(await band.find({ key: 'keep-h' })).toBeUndefined()

  await band.press({ key: 'keep' })
  expect((await band.find({ key: 'keep' }))?.props.label).toBe('○')
  await band.unmount()
})

test('the picker offers 00, 15, 30 and 45 minutes and opens at the first quarter hour the cache does not already cover', async ($, on) => {
  await seed($, on) // last reply 10 min ago: the cache is warm until 22:60 -> 23:00 UTC-ish
  const band = await $.ui.mount({ plugin: 'ribbon-lite', surface: 'desktop', component: 'AbovePrompt', props: PROPS })
  await band.press({ key: 'keep' })
  const minutes = await band.find({ key: 'keep-m' })
  expect((minutes?.props.options as { value: string }[]).map(o => o.value)).toEqual(['00', '15', '30', '45'])
  await band.unmount()
})

test('a deadline inside the hour the cache already has left is refused and the picker stays open', async ($, on) => {
  await seed($, on)
  const band = await $.ui.mount({ plugin: 'ribbon-lite', surface: 'desktop', component: 'AbovePrompt', props: PROPS })
  await band.press({ key: 'keep' })
  // 10 minutes ago + 60: warm for 50 more. Pick the current hour and minute 00..45 that is still inside it.
  const nowMs = NOW
  const inside = new Date(nowMs + 20 * 60_000)
  await band.select({ key: 'keep-h', value: String(inside.getHours()).padStart(2, '0') })
  await band.select({ key: 'keep-m', value: String(Math.floor(inside.getMinutes() / 15) * 15).padStart(2, '0') })
  await band.press({ key: 'keep-set' })
  expect((await band.find({ key: 'keep' }))?.props.label).toBe('×')
  expect(await band.find({ key: 'keep-h' })).toBeDefined()
  await band.unmount()
})

test('a deadline more than 12 hours out turns the robot yellow, and a nearer one green', async ($, on) => {
  await seed($, on)
  const band = await $.ui.mount({ plugin: 'ribbon-lite', surface: 'desktop', component: 'AbovePrompt', props: PROPS })

  await band.press({ key: 'keep' })
  await band.press({ key: 'keep-8' })
  const near = JSON.stringify(await band.findAll({ type: 'Svg' }))
  expect(near).toContain('7fb069')
  expect(near).not.toContain('f5a623')

  await band.press({ key: 'keep' }) // off
  await band.press({ key: 'keep' }) // open
  const far = new Date(NOW + 13 * 3_600_000)
  await band.select({ key: 'keep-h', value: String(far.getHours()).padStart(2, '0') })
  await band.select({ key: 'keep-m', value: String(Math.floor(far.getMinutes() / 15) * 15).padStart(2, '0') })
  await band.press({ key: 'keep-set' })
  const long = JSON.stringify(await band.findAll({ type: 'Svg' }))
  expect(long).toContain('f5a623')
  expect(long).not.toContain('7fb069')
  await band.unmount()
})
