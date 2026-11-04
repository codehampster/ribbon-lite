# ribbon-lite

A Claude Code mod: one slim band above your prompt showing

- **7D / 5H** — how much of each usage window is left, and when it resets
- **CTX** — how full the context window is (green → yellow at 60% → red at 80%)
- **API** — what this session has cost at API list prices, how much input the prompt cache served (hit %), and what the cache saved versus sending those tokens fresh. On a subscription plan these are API-equivalent figures, not what you are billed; the 7D and 5H bars are your real limits
- **Cache chip** — red with minutes left while the prompt cache is warm; blue COLD with idle time and next-message cost once it expires (click **Show** for the full card)
- **Keep-warm toggle** (○ before the robot) — click it, roll the hour (00–23) and minutes (00 or 30) to the local time you want it warm until and press **Keep**, or press 2h / 4h / 8h / 12h. While on, it shows the time (`◉→18:30`), the robot turns green, and a tiny ping goes out whenever the cache would otherwise expire before then (every ~55 min idle), so a break does not pay to re-cache the whole context. The ping schedule is separate from your deadline. Capped at 14h, since a cold restart costs about as much as 15–19 pings; click `◉` to turn it off. It only works while the app is running and the computer is awake
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
