/** One usage window: which one, how much is used (0 to 100), when it resets. */
export type Window = { kind: string; percentUsed: number; resetsAt?: string }

/** The prompt cache as last seen: last main-thread request time, context size, window, model. */
export type CacheFacts = { lastAt: number; tokens: number; window: number; model: string | null }

/** Whether the cache card is open, remembered only for the state it was set in. */
export type Fold = { mode: 'warm' | 'cold'; open: boolean }

/** Input tokens this session: served from cache vs sent fresh (uncached + cache writes). */
export type Spend = { read: number; input: number }

/** Keep-warm: on/off, the local time (epoch ms) to be warm until, whether the time picker is open and its hour and minute, the last cold flip announced, and whether the context nudge fired. */
export type Keep = { on: boolean; until?: number; editing?: boolean; h?: number; m?: number; editUntil?: number; coldSeen: number; nudged: boolean }

declare module 'claude-code' {
  interface PluginState {
    'ribbon-lite': { windows: Window[]; cache: CacheFacts | null; fold: Fold | null; spend: Spend; keep: Keep }
  }
}
