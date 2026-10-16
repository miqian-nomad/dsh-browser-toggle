# dsh-browser-toggle

A Settings card for [`dsh-browser-playwright-codex`](https://github.com/miqian-nomad/dsh-browser-playwright-codex):
turn the browser capability on or off, pick how it reads a page, and decide whether the two
power tools (`browser_evaluate`, `browser_cdp`) exist at all — all without restarting DSH.

Companion package, not a plugin you would install on its own: it drives the browser plugin's
shared runtime state and writes one config block that plugin consumes.

## Why this is a separate package

Not a taste decision — a constraint. `dsh-client-modules` rejects a package that is mounted from
**multiple loader entries**, and the browser plugin is mounted as three (`browser` service,
`browser-playwright` provider, `browser-tool` tool family) because those are separate concerns with
separate config. A Settings card needs a **client** module, and a client module cannot live in a
package mounted three times. So the card got its own single-entry package, and `cordis.patch.yml`
here inserts exactly one row.

## Install

In a DSH profile (`~/.dsh/profiles/<name>/package.json`):

```jsonc
{
  "dependencies": {
    "dsh-browser-playwright-codex": "link:/path/to/dsh-browser-playwright-codex",
    "dsh-browser-toggle": "link:/path/to/dsh-browser-toggle"
  },
  "dsh": {
    "profile": {
      "bundles": [
        // … your other bundles …
        "dsh-browser-playwright-codex",
        "dsh-browser-toggle"
      ],
      "patchReload": "live"
    }
  }
}
```

`patchReload: live` is what makes the switches apply without a restart.

## What the card does

| Control | Effect |
|---|---|
| **Allow the AI to drive pages** | Flips the browser plugin's shared enable flag (state file + shared module). Off tears down any open window in-process; the profile and login state are kept. |
| **Page reading mode** | `compatible` (the plugin's own DOM walk) or `smart` (the browser's official accessibility tree). Read per capture, so it applies from the next operation. |
| **Power tools** (`Allow arbitrary page JavaScript`, `Allow raw CDP`) | Whether `browser_evaluate` / `browser_cdp` are **registered at all**. Off means the tool does not exist for the model — not "exists but refuses" — so it also costs no prompt tokens. |

The first two are read at use time. The power gates are registration-time, so they are applied by
editing config and letting the loader re-apply the tree (about a second with `patchReload: live`).

## Where the choice is stored

The gates are written into the **home-level** patch layer (the one with the highest priority),
inside one managed block:

```
$DSH_HOME/cordis.patch.yml

# >>> dsh-browser-toggle: 强力工具闸门（本块由设置页维护，也可手工编辑）>>>
- id: browser-tool
  name: "dsh-browser-playwright-codex/tool"
  config:
    toolPrefix: "browser_"
    allowEvaluate: true
    allowCdp: true
    registerDisabledTools: false
    maxWaitMs: 60000
# <<< dsh-browser-toggle <<<
```

Three deliberate properties:

- **The package you download never enables them.** `cordis.patch.yml` inside the browser plugin
  ships both gates `false`; anything enabled there would be enabled for every installer. The choice
  belongs to the deployment, and this card writes it there.
- **All tool keys are listed.** dsh replaces an entry's `config` object wholesale, so a shorter
  block would silently reset the keys it omits.
- **The write is guarded.** Backup first (`.bak-browser-toggle`), temp file plus atomic rename, then
  read back and verify. A failed check restores the previous bytes. That file is the layer every
  plugin load goes through — a half-written block breaks the whole profile, not just this card.

## HTTP API

The card is a thin client over four routes. CSRF: `POST` requires the `x-dsh-plugin: browser-toggle`
header (same pattern as the other switch plugins).

| Route | Body | Returns |
|---|---|---|
| `GET /api/browser-playwright/state` | — | `{ enabled, engine, engineUserChosen, allowEvaluate, allowCdp, patchGates }` |
| `POST /api/browser-playwright/toggle` | `{ enabled }` | `{ enabled, changed }` |
| `POST /api/browser-playwright/engine` | `{ engine: 'legacy' \| 'aria' }` | `{ engine, changed }` |
| `POST /api/browser-playwright/gates` | `{ allowEvaluate, allowCdp }` | `{ allowEvaluate, allowCdp, changed, patch }` |

`allowEvaluate` / `allowCdp` are the **effective** values, published by the browser plugin itself
(`runtime-state.publishGates`) — the card cannot guess them, because they may come from the bundle
default, a profile patch or this home-level block. `patchGates` is what this card's own block says;
the two differ only between a write and the reload that applies it, which makes it the diagnostic
when a switch looks like it did nothing.

## Requirements

- `dsh-browser-playwright-codex` with the `runtime-state` export (0.4.0 and later).
- If that package is older than its `getGates` export, the card still loads and shows the power
  switches as unknown instead of failing.

## Test

```
npm test
```

Node builtins only — no install, no browser, works offline. It drives the real
`lib/gates-patch.js` against a throwaway `DSH_HOME` and checks that other content survives byte for
byte, a second write replaces rather than appends, the merge works mid-file, backups appear, and a
failed self-check restores the previous bytes. CI runs it on Linux and Windows.

## License

MIT — see [LICENSE](LICENSE).

## Logged-in sites (read-only)

The card lists the sites this browser **looks** signed in to — an inference from the browser's own
cookies, aggregated per registrable domain (analytics and consent cookies are dropped first, so a
site you merely visited does not show up), scored on httpOnly / lifetime / session-like names and
labelled "推测登录" rather than presented as fact.

Privacy boundaries, deliberately: the payload carries domain names, counts and signal labels —
**no cookie names and no cookie values**; it lives in memory only (never on disk); the model cannot
read it (no tool, nothing in diagnostics); and the only route that serves it,
`GET /api/browser-playwright/logins`, **requires the `x-dsh-plugin` custom header**, so any other
page in the browser cannot read it off 127.0.0.1. Hiding a row is a display preference kept in this
browser's `localStorage` — there is no server-side record of what you hid.
