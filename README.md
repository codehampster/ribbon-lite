# ribbon-lite

A Claude Code mod: one slim band above your prompt showing

- **7D / 5H** — how much of each usage window is left, and when it resets
- **CTX** — how full the context window is (green → yellow at 60% → red at 80%)
- **API** — what this session has cost at API list prices, how much input the prompt cache served (hit %), and what the cache saved versus sending those tokens fresh. On a subscription plan these are API-equivalent figures, not what you are billed; the 7D and 5H bars are your real limits
- **Cache chip** — red with minutes left while the prompt cache is warm; blue COLD with idle time and next-message cost once it expires (click **Show** for the full card)
- **Keep-warm toggle** (○ before the robot) — while on, the robot turns green and a tiny ping goes out at about 55 minutes idle so a short break does not pay to re-cache the whole context. It turns itself off after 8 pings: a cold restart costs about as much as 15–19 pings, so leaving it on longer would waste usage
- **Toasts** — once when the cache goes cold (with the re-cache price), and once when the context passes 70%
- **Show card** — cache size, a **context breakdown** (what fills the window: messages, tools, system prompt), and what the next message costs on each model

Zero token cost: it only reads figures Claude Code already has.

Forked from [robonuggets/ribbon](https://github.com/robonuggets/ribbon) by Jay E (MIT), with CTX and API cost added.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install ribbon-lite --marketplace codehampster/ribbon-lite
```

Type `y` to add the marketplace, then pick the user scope.

From a shell:

```
claude plugin install ribbon-lite --marketplace codehampster/ribbon-lite
```

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `codehampster/ribbon-lite`, then Add plugin.

If you already have the original ribbon installed, disable it so you get one band.
