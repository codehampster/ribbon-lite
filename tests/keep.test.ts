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

test('clicking the toggle opens the flag with four choices, each showing its end time', async ($, on) => {
  await seed($, on)
  const band = await $.ui.mount({ plugin: 'ribbon-lite', surface: 'desktop', component: 'AbovePrompt', props: PROPS })

  expect((await band.find({ key: 'keep' }))?.props.label).toBe('○')
  expect(await band.find({ key: 'keep-4' })).toBeUndefined()

  await band.press({ key: 'keep' })
  expect((await band.find({ key: 'keep' }))?.props.label).toBe('×')
  for (const h of [2, 4, 8, 12]) {
    expect(await band.find({ key: `keep-${h}` })).toBeDefined()
    expect(await band.find({ type: 'Text', text: `${h}h` })).toBeDefined()
  }
  await band.unmount()
})

test('a choice sets the deadline, shows it on the toggle, greens the robot and closes the flag', async ($, on) => {
  await seed($, on)
  const band = await $.ui.mount({ plugin: 'ribbon-lite', surface: 'desktop', component: 'AbovePrompt', props: PROPS })

  await band.press({ key: 'keep' })
  await band.press({ key: 'keep-4' })
  expect((await band.find({ key: 'keep' }))?.props.label).toMatch(/^◉→\d\d:\d\d$/)
  expect(await band.find({ key: 'keep-4' })).toBeUndefined()
  expect(JSON.stringify(await band.findAll({ type: 'Svg' }))).toContain('7fb069')

  await band.press({ key: 'keep' })
  expect((await band.find({ key: 'keep' }))?.props.label).toBe('○')
  await band.unmount()
})

test('clicking the × closes the flag without choosing', async ($, on) => {
  await seed($, on)
  const band = await $.ui.mount({ plugin: 'ribbon-lite', surface: 'desktop', component: 'AbovePrompt', props: PROPS })
  await band.press({ key: 'keep' })
  await band.press({ key: 'keep' })
  expect((await band.find({ key: 'keep' }))?.props.label).toBe('○')
  expect(await band.find({ key: 'keep-2' })).toBeUndefined()
  await band.unmount()
})
