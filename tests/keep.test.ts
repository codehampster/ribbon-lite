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
