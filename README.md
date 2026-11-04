# ribbon-lite

A Claude Code mod: one slim band above your prompt showing

- **7D / 5H** — how much of each usage window is left, and when it resets
- **CTX** — how full the context window is (green → yellow at 60% → red at 80%)
- **SESSION** — what this session has cost so far, and how much input the prompt cache served
- **WARM / COLD** — whether the prompt cache is live, minutes left, and what the next message costs (click **Show** for the full card)

Zero token cost: it only reads figures Claude Code already has.

Forked from [robonuggets/ribbon](https://github.com/robonuggets/ribbon) by Jay E (MIT), with CTX and SESSION added.

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
