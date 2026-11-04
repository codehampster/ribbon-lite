import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CacheFacts, Fold, Keep, Spend, Window } from '../types'
import {
  BG, EMPTY, HUE, INK, MUTED, ORANGE, ROBO_SIZE, TEXT, TTL_MIN, TTL_MS, WORD, YELLOW,
  MODELS, bandPx, cardSvg, chipSvg, costOf, familyOf, fmtIdle, kindOf, mineModel, roboSvg, tok, usd,
} from './cache-art'
import type { CacheView } from './cache-art'

// A band above the prompt in a warm dark look: card surface, cream text,
// dot-matrix bars. Shows how much of each usage window is LEFT, 7-day first, then
// 5-hour; 7D is orange, 5H is yellow; a window under 15% adds a bold LOW.
//
// After the first reply it also shows the prompt cache: WARM (red, Robo bobbing)
// for an hour after the last request, then COLD (blue, Robo frozen) with what the
// next message costs to re-cache. Hide / Show folds the card; warm starts folded,
// cold starts open, and a choice holds until the cache flips. Zero token cost:
// it reads the engine's own figures and draws.

const CELLS = 10
const LOW_AT = 15
const TIGHT_CELLS = 6
/** How often the band redraws, so the countdown and the warm-to-cold flip stay current. */
const TICK_MS = 30_000

const windows = atom({ plugin: 'ribbon-lite', key: 'windows' } as const, [] as Window[])
const cache = atom({ plugin: 'ribbon-lite', key: 'cache' } as const, null as CacheFacts | null)
const fold = atom({ plugin: 'ribbon-lite', key: 'fold' } as const, null as Fold | null)
const spend = atom({ plugin: 'ribbon-lite', key: 'spend' } as const, { read: 0, input: 0 } as Spend)

// Added to the fork: CTX (context fill, green → yellow → red) and SESSION (cost so far, cache hit rate).
const GREEN = '#7fb069'
const keep = atom({ plugin: 'ribbon-lite', key: 'keep' } as const, { on: false, coldSeen: 0, nudged: false } as Keep)

// Keep-warm: pick 2, 4, 8 or 12 hours from a short bar of buttons; the deadline is then now plus that long. While it
// is still ahead, one tiny ping goes out whenever the cache would otherwise expire before
// then (55 min idle). The ping cadence is separate from the deadline. A cold restart costs
// about as much as 15-19 pings, so 12h is the longest on offer.
const KEEP_AT_MIN = 55
const KEEP_PRESETS = [2, 4, 8, 12]
/** The picker closes itself after this long without a touch. */
const EDIT_MS = 20_000

const pad2 = (n: number): string => String(n).padStart(2, '0')
const hhmm = (ms: number): string => {
  const d = new Date(ms)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
const NUDGE_AT = 70
const PING = 'Keep-warm ping from ribbon-lite: reply with just "ok".'

const ctxColor = (pct: number): string => (pct >= 80 ? HUE.warm : pct >= 60 ? YELLOW : GREEN)

const NAMES: Record<string, string> = { seven_day: '7D', five_hour: '5H', spend_limit: 'SPEND' }
const ORDER: Record<string, number> = { seven_day: 0, five_hour: 1 }
const COLORS: Record<string, string> = { seven_day: ORANGE, five_hour: YELLOW }

const clean = (list: readonly Window[]): Window[] =>
  list
    .map(w => ({ kind: w.kind, percentUsed: w.percentUsed, resetsAt: w.resetsAt }))
    .sort((a, b) => (ORDER[a.kind] ?? 9) - (ORDER[b.kind] ?? 9))

const dots = (left: number, cells: number): { on: string; off: string } => {
  const n = Math.max(0, Math.min(cells, Math.round((left / 100) * cells)))
  return { on: '●'.repeat(n), off: '·'.repeat(cells - n) }
}

const fmtReset = (iso: string | undefined, now: number): string => {
  if (!iso) return ''
  const ms = Date.parse(iso) - now
  if (Number.isNaN(ms)) return ''
  if (ms <= 0) return 'resetting'
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ${mins % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

/** What the cache drawings read, or null until a request and its context size are known. */
export const viewOf = (c: CacheFacts | null, now: number): CacheView | null => {
  if (!c || c.lastAt <= 0 || c.tokens <= 0) return null
  const idleMs = Math.max(0, now - c.lastAt)
  return {
    mode: idleMs >= TTL_MS ? 'cold' : 'warm',
    idle: fmtIdle(idleMs),
    idleMin: Math.floor(idleMs / 60000),
    tokens: c.tokens,
    window: c.window,
    mine: familyOf(c.model),
  }
}

const pull = async ($: EngineInterface): Promise<void> => {
  const u = await $.session.usage()
  await update($, windows, () => clean(u.rateLimits))
}

/** Fresh context figures from the engine onto the cache facts, when it has them. */
const measure = async ($: EngineInterface, lastAt: number | null, model: string | null): Promise<void> => {
  const u = await $.session.usage()
  const m = model ?? (await $.session.model())
  await update($, cache, c => ({
    lastAt: lastAt ?? c?.lastAt ?? 0,
    tokens: u.context.tokens && u.context.tokens > 0 ? u.context.tokens : (c?.tokens ?? 0),
    window: u.context.window || c?.window || 0,
    model: m || c?.model || null,
  }))
}

/** Close the picker once it has sat untouched for EDIT_MS. */
const closePicker = async ($: EngineInterface): Promise<void> => {
  const k = await read($, keep)
  if (k.editing && (await $.clock.now()) > (k.editUntil ?? 0)) await update($, keep, x => ({ ...x, editing: false }))
}

/** Once a minute: send the keep-warm ping when due, or say once that the cache went cold. */
const watch = async ($: EngineInterface): Promise<void> => {
  const c = await read($, cache)
  if (!c || c.lastAt <= 0 || c.tokens <= 0) return
  const now = await $.clock.now()
  const idleMin = (now - c.lastAt) / 60000
  const k = await read($, keep)
  if (k.on) {
    const until = k.until ?? 0
    const off = () => update($, keep, x => ({ ...x, on: false, until: undefined }))
    if (now >= until) {
      await off()
    } else if (c.lastAt + TTL_MS >= until) {
      await off()
      $.ui.toast(`Keep-warm done: the cache stays warm through ${hhmm(c.lastAt + TTL_MS)}.`, { timeoutMs: 8000 })
    } else if (idleMin >= TTL_MIN) {
      await off() // went cold while the machine was away; the toast below says so
    } else if (idleMin >= KEEP_AT_MIN) {
      await $.prompt.submit({ text: PING })
      return
    }
  }
  if (idleMin >= TTL_MIN && k.coldSeen !== c.lastAt) {
    await update($, keep, x => ({ ...x, coldSeen: c.lastAt }))
    const m = MODELS.find(x => x.id === familyOf(c.model))
    $.ui.toast(`Cache went cold${m ? `: next message re-caches ${tok(c.tokens)} tokens, about ${usd(costOf(m, 'cold', c.tokens))}` : ''}.`, { timeoutMs: 10000 })
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await pull($)
    $.clock.every(TICK_MS, () => $.ui.invalidate('ui.render'))
    $.clock.every(60_000, () => { void watch($) })
    $.clock.every(5_000, () => { void closePicker($) })
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await update($, windows, () => clean(e.rateLimits))
    }
    if (e.changed.includes('context') && e.context.tokens && e.context.tokens > 0) {
      const tokens = e.context.tokens
      await update($, cache, c => (c ? { ...c, tokens, window: e.context.window || c.window } : c))
    }
    return next(e)
  })

  // A resumed or forked session knows how long it was away and how big it is.
  on('classic.SessionStart', async ($, e, next) => {
    const r = await next(e)
    if (e.source === 'clear' || e.source === 'compact') {
      await update($, cache, () => null)
      await update($, fold, () => null)
      await update($, keep, k => ({ ...k, coldSeen: 0, nudged: false }))
    } else if ((e.source === 'resume' || e.source === 'fork') && typeof e.seconds_since_last_response === 'number') {
      const now = await $.clock.now()
      const lastAt = now - e.seconds_since_last_response * 1000
      const window = (await $.session.usage()).context.window
      const model = typeof e.model === 'string' ? e.model : await $.session.model()
      const tokens = typeof e.context_tokens === 'number' ? e.context_tokens : 0
      await update($, cache, () => ({ lastAt, tokens, window, model }))
    }
    return r
  }).catch(($, e, next) => next(e)) // a band that fails to seed never holds up the session

  // Each main-thread request reads or writes the cache, so its start resets the hour.
  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) {
      const now = await $.clock.now()
      await update($, cache, c => ({ lastAt: now, tokens: c?.tokens ?? 0, window: c?.window ?? 0, model: c?.model ?? null }))
    }
    yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    const u = e.usage
    if (u) {
      // Hit rate over every request, subagents included: they bill the same.
      const fresh = u.input_tokens + (u.cache_creation_input_tokens ?? 0)
      await update($, spend, s => ({ read: s.read + u.cache_read_input_tokens, input: s.input + fresh }))
    }
    if (e.agentId) return r
    const now = await $.clock.now()
    const c = await read($, cache)
    // turn.step stamps the exact request time; when no step of this turn did, the turn's end is the floor.
    const lastAt = !c || now - c.lastAt > e.durationMs ? now : c.lastAt
    await measure($, lastAt, e.usage?.model ?? null)
    const ctx = (await $.session.usage()).context
    const pct = ctx.tokens && ctx.window ? (ctx.tokens / ctx.window) * 100 : 0
    const k = await read($, keep)
    if (pct >= NUDGE_AT && !k.nudged) {
      await update($, keep, x => ({ ...x, nudged: true }))
      $.ui.toast(`Context is ${Math.round(pct)}% full: a fresh session for the next task keeps turns cheap.`, { timeoutMs: 10000 })
    }
    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    // Svg draws on desktop, mobile and VS Code; the terminal gets the text form.
    // Ask the surface, not the table: the terminal's table still lists Svg.
    const Svg = e.surface !== 'terminal' && 'Svg' in ui ? ui.Svg : null
    const list = await read($, windows)
    const now = await $.clock.now()
    const view = viewOf(await read($, cache), now)

    if (list.length === 0 && !view) {
      return (
        <Box backgroundColor={BG} paddingX={1}>
          <Text color={MUTED}>USAGE · waiting for the first reply</Text>
        </Box>
      )
    }

    const columns = e.props.bodyColumns ?? e.viewport?.columns ?? 100
    // Wide only when the whole row fits; otherwise stack, so nothing wraps onto a second line.
    // Rough cell count: label, each window, CTX, API with its detail, the cache badge and Show.
    const fitsWide = async (): Promise<boolean> => {
      const u0 = await $.session.usage()
      const c0 = await read($, cache)
      const s0 = await read($, spend)
      const t0 = u0.context.tokens ?? c0?.tokens ?? 0
      const w0 = u0.context.window || c0?.window || 0
      let est = 0 // the wide row drops the USAGE label
      for (const w of list) {
        const left = Math.max(0, Math.round((100 - w.percentUsed) * 10) / 10)
        est += 3 + CELLS + ` ${left}% left`.length + (w.resetsAt ? ` · ${fmtReset(w.resetsAt, now)}`.length : 0) + 2
      }
      if (t0 > 0 && w0 > 0) est += 4 + CELLS + ` ${Math.round((t0 / w0) * 100)}% · ${tok(t0)}/${tok(w0)}`.length + 2
      const fed0 = s0.read + s0.input
      if (u0.cost?.usd !== undefined || fed0 > 0) {
        const m0 = MODELS.find(x => x.id === familyOf(c0?.model ?? null))
        const sv = m0 ? (s0.read / 1e6) * (m0.input - m0.read) : 0
        const hit = fed0 > 0 ? ` · ${Math.round((s0.read / fed0) * 100)}% hit` : ''
        est += 4 + usd(u0.cost?.usd ?? 0).length + hit.length + (sv >= 0.01 ? ` · saved ${usd(sv)}`.length : 0) + 2
      }
      est += 8 + 3 + 6 + 7 // toggle, robo, chip, Show
      // The desktop's proportional font draws this text about 15% narrower than a cell each.
      return (e.surface === 'terminal' ? est : est * 0.85) <= columns
    }
    const kind = kindOf(columns) === 'wide' && !(await fitsWide()) ? 'stacked' : kindOf(columns)
    const isWide = kind === 'wide'
    const cells = kind === 'tight' ? TIGHT_CELLS : CELLS

    const parts = (w: Window) => {
      const left = Math.max(0, Math.round((100 - w.percentUsed) * 10) / 10)
      return {
        left,
        col: COLORS[w.kind] ?? TEXT,
        name: NAMES[w.kind] ?? w.kind.toUpperCase(),
        d: dots(left, cells),
        reset: fmtReset(w.resetsAt, now),
      }
    }

    // Wide: every window on one row. Narrow: each window is a block of three
    // lines (name and dots, percent left, reset time) so nothing wraps or clips.
    const wide = (w: Window, i: number) => {
      const p = parts(w)
      return (
        <Box key={`w-${i}`} flexDirection="row" flexShrink={0} marginRight={2}>
          <Text color={MUTED} bold>{p.name} </Text>
          <Text color={p.col}>{p.d.on}</Text>
          <Text color={EMPTY}>{p.d.off}</Text>
          <Text color={p.col} bold> {p.left}% left</Text>
          {p.left < LOW_AT ? <Text color={TEXT} bold> LOW</Text> : null}
          {p.reset ? <Text color={MUTED}> · {p.reset}</Text> : null}
        </Box>
      )
    }

    const stacked = (w: Window, i: number) => {
      const p = parts(w)
      return (
        <Box key={`w-${i}`} flexDirection="column" flexShrink={0} marginRight={2}>
          <Box flexDirection="row">
            <Text color={MUTED} bold>{p.name} </Text>
            <Text color={p.col}>{p.d.on}</Text>
            <Text color={EMPTY}>{p.d.off}</Text>
          </Box>
          <Box flexDirection="row">
            <Text color={p.col} bold>{p.left}% left</Text>
            {p.left < LOW_AT ? <Text color={TEXT} bold> LOW</Text> : null}
          </Box>
          {p.reset ? <Text color={MUTED}>resets {p.reset}</Text> : null}
        </Box>
      )
    }

    const label = (
      <Box key="label" flexShrink={0} marginRight={isWide ? 2 : 3}>
        <Text color={TEXT} bold>USAGE</Text>
      </Box>
    )
    const usage = list.length > 0
      ? list.map(isWide ? wide : stacked)
      : [<Box key="wait" flexShrink={0} marginRight={2}><Text color={MUTED}>waiting for the first reply</Text></Box>]

    // CTX and SESSION, drawn like the usage windows: name, dot bar, bold figure, muted detail.
    const su = await $.session.usage()
    const cf = await read($, cache)
    const ctxTokens = su.context.tokens ?? cf?.tokens ?? 0
    const ctxWindow = su.context.window || cf?.window || 0
    const sp = await read($, spend)
    const fed = sp.read + sp.input
    const extra = (k: string, name: string, col: string, n: number | null, fig: string, detail: string) =>
      isWide ? (
        <Box key={k} flexDirection="row" flexShrink={0} marginRight={2}>
          <Text color={MUTED} bold>{name} </Text>
          {n !== null ? <Text color={col}>{'●'.repeat(n)}</Text> : null}
          {n !== null ? <Text color={EMPTY}>{'·'.repeat(cells - n)}</Text> : null}
          <Text color={col} bold>{n !== null ? ' ' : ''}{fig}</Text>
          {detail ? <Text color={MUTED}> · {detail}</Text> : null}
        </Box>
      ) : (
        <Box key={k} flexDirection="column" flexShrink={0} marginRight={2}>
          <Box flexDirection="row">
            <Text color={MUTED} bold>{name} </Text>
            {n !== null ? <Text color={col}>{'●'.repeat(n)}</Text> : null}
            {n !== null ? <Text color={EMPTY}>{'·'.repeat(cells - n)}</Text> : null}
          </Box>
          <Text color={col} bold>{fig}</Text>
          {detail ? <Text color={MUTED}>{detail}</Text> : null}
        </Box>
      )
    if (ctxTokens > 0 && ctxWindow > 0) {
      const pct = Math.min(100, Math.round((ctxTokens / ctxWindow) * 100))
      const n = Math.max(0, Math.min(cells, Math.round((pct / 100) * cells)))
      usage.push(extra('ctx', 'CTX', ctxColor(pct), n, `${pct}%`, `${tok(ctxTokens)}/${tok(ctxWindow)}`))
    }
    const cost = su.cost?.usd
    if (cost !== undefined || fed > 0) {
      // SAVED: what the cache-read tokens would have cost sent fresh, at your model's API rates.
      const m = MODELS.find(x => x.id === familyOf(cf?.model ?? null))
      const saved = m ? (sp.read / 1e6) * (m.input - m.read) : 0
      const detail = [fed > 0 ? `${Math.round((sp.read / fed) * 100)}% hit` : '', saved >= 0.01 ? `saved ${usd(saved)}` : '']
        .filter(Boolean).join(' · ')
      usage.push(extra('sess', 'API', TEXT, null, cost !== undefined ? usd(cost) : '—', detail))
    }

    // Before the first reply there is no cache to show: today's band, as it was.
    if (!view) {
      return (
        <Box flexDirection="row" backgroundColor={BG} paddingX={1}>
          {label}
          {usage}
        </Box>
      )
    }

    const mode = view.mode
    const cold = mode === 'cold'
    const hue = HUE[mode]
    const mine = mineModel(view)
    // Warm: the chip itself shows the minutes left, its colour says warm.
    const chipWord = cold ? WORD[mode] : `${Math.max(0, TTL_MIN - view.idleMin)}m`
    const stored = await read($, fold)
    // Folding needs the card, and the card is a drawing: the terminal stays folded.
    const open = Svg !== null && (stored && stored.mode === mode ? stored.open : cold)
    const toggle = () =>
      update($, fold, f => ({ mode, open: !(f && f.mode === mode ? f.open : mode === 'cold') }))

    // Keep-warm toggle: one glyph before Robo. Off, a click opens the time field; on, it shows
    // the time it is kept warm until, and a click turns it off. On, Robo turns green.
    const kp = await read($, keep)
    // The chip's colour: green while kept warm or over 20m left, yellow to 5m, then red. Robo shows the keep-warm timer: red off, green on, yellow for its last 20m.
    const left = TTL_MIN - view.idleMin
    const nowMs = await $.clock.now()
    const roboTint = cold || !kp.on ? undefined : kp.until && kp.until - nowMs <= 20 * 60_000 ? YELLOW : GREEN
    const tone = cold ? undefined : kp.on || left > 20 ? GREEN : left >= 5 ? YELLOW : HUE.warm
    const keepFor = async (hours: number) => {
      const t = await $.clock.now()
      await update($, keep, x => ({ ...x, on: true, until: t + hours * 3_600_000, editing: false }))
    }
    // Cold: nothing left to keep warm, so no toggle.
    const keepToggle = cold ? null : (
      <Button key="keep" plain label={kp.on && kp.until ? `◉→${hhmm(kp.until)}` : kp.editing ? '×' : '○'} dimColor={!kp.on}
        onPress={() => {
          void (async () => {
            const k0 = await read($, keep)
            if (k0.on) return update($, keep, x => ({ ...x, on: false, until: undefined, editing: false }))
            if (k0.editing) return update($, keep, x => ({ ...x, editing: false }))
            const t = await $.clock.now()
            return update($, keep, x => ({ ...x, editing: true, editUntil: t + EDIT_MS }))
          })()
        }} />
    )
    // The flag: a short bar of four choices, right above the toggle and robot.
    const keepRow = Svg && !cold && kp.editing && !kp.on ? (
      <Box key="keep-edit" flexDirection="row" alignSelf="flex-end" marginRight={10} marginY={1} gap={1}>
        {KEEP_PRESETS.map(hrs => (
          <Button key={`keep-${hrs}`} label={`${hrs}h`} onPress={() => { void keepFor(hrs) }} />
        ))}
      </Box>
    ) : null
    const badge = Svg
      ? [
          keepToggle,
          <Svg key="robo" source={roboSvg(mode, roboTint)} alt={cold ? 'Robo, frozen' : 'Robo, bobbing'} width={ROBO_SIZE} height={ROBO_SIZE} isInteractive />,
          <Text key="gap"> </Text>,
          (() => {
            const c = chipSvg(mode, chipWord, tone)
            return <Svg key="chip" source={c.source} alt={cold ? WORD[mode] : `warm, ${chipWord} left`} width={c.w} height={c.h} />
          })(),
        ]
      : [<Text key="chip" backgroundColor={hue} color={INK} bold>{` ${chipWord} `}</Text>]

    const summary = cold
      ? [
          <Text key="idle" color={hue} bold>{` ${view.idle}`}</Text>,
          mine ? <Text key="dot" color={MUTED}> · </Text> : null,
          mine ? <Text key="cost" color={TEXT} bold>{usd(costOf(mine, mode, view.tokens))}</Text> : null,
        ]
      : []

    const button = Svg ? (
      <Box key="fold" flexShrink={0} alignItems="flex-start">
        <Button key="cache-fold" label={open ? 'Hide' : 'Show'} onPress={toggle} />
      </Box>
    ) : null
    const grow = <Box key="grow" flexGrow={1} />

    let rows
    if (kind === 'wide') {
      rows = (
        <Box key="row" flexDirection="row" paddingX={1} alignItems="center" flexWrap="wrap" justifyContent="space-between">
          {usage}
          {open ? null : (
            <Box key="inline" flexDirection="row" flexShrink={0} marginRight={2} alignItems="center">
              {badge}
              {summary}
            </Box>
          )}
          {button}
        </Box>
      )
    } else if (kind === 'stacked') {
      // The cache becomes a third stacked block, the same shape as 7D and 5H.
      rows = (
        <Box key="row" flexDirection="row" paddingX={1}>
          {label}
          {usage}
          {open ? null : (
            <Box key="block" flexDirection="column" flexShrink={0} marginRight={2}>
              <Box flexDirection="row" alignItems="center">{badge}</Box>
              <Text color={hue} bold>{cold ? `${view.idle} idle` : ''}</Text>
              {mine ? (
                <Box flexDirection="row">
                  <Text color={TEXT} bold>{usd(costOf(mine, mode, view.tokens))}</Text>
                  <Text color={MUTED}> next</Text>
                </Box>
              ) : null}
            </Box>
          )}
          {grow}
          {button}
        </Box>
      )
    } else {
      // Narrow: the cache gets its own row under the usage blocks.
      rows = [
        <Box key="row" flexDirection="row" paddingX={1}>
          {label}
          {usage}
        </Box>,
        <Box key="cache" flexDirection="row" paddingX={1} alignItems="center">
          {badge}
          {summary}
          {grow}
          {button}
        </Box>,
      ]
    }

    let card = null
    if (open && Svg) {
      // The breakdown is estimated locally ('summary'): no API call, no token cost.
      const bd = (await $.session.usage({ breakdown: 'summary' })).context.breakdown
      const ctxRows = (bd?.categories ?? []).filter(r => r.kind === 'used' && r.tokens > 0).map(r => ({ name: r.name, tokens: r.tokens }))
      const c = cardSvg(view, kind, bandPx(columns), ctxRows)
      card = (
        <Box key="card" flexDirection="row">
          <Svg source={c.source} alt={c.alt} width={c.w} height={c.h} isInteractive={kind !== 'tight'} />
        </Box>
      )
    }

    return (
      <Box flexDirection="column" backgroundColor={BG} marginBottom={1}>
        {keepRow}
        {rows}
        {card}
      </Box>
    )
  })
}
