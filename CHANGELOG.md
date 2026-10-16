# Changelog

## Unreleased

- 卡片新增一节**只读**的「已登录的站点」：从主插件发布的 cookie 推断（域名 + 条数 + 信号，**没有 cookie
  名与值**），可逐行隐藏（偏好存本机 localStorage）。
- 新增 `GET /api/browser-playwright/logins`，**强制 `x-dsh-plugin` 防伪头**（不带即 403）——这份 payload
  是用户的登录站点名单，不该能被浏览器里别的页面读走。
- **补掉 `GET /api/browser-playwright/state` 不校验防伪头的缺口**（四个路由里唯一一个），客户端读写都带头。
- 新增 `tests/logins-route.test.mjs`（4 条：403 / 正常回传 / 405 / /state 也要求头）。

## 0.2.0

### Added

- **Two power-tool switches in the card.** `Allow arbitrary page JavaScript` and `Allow raw CDP`
  now control whether `browser_evaluate` / `browser_cdp` are registered at all. They are
  registration-time gates, so the card writes them into a managed block in the home-level
  `cordis.patch.yml` and lets `patchReload: live` re-apply the tree — no restart, measured at about
  a second. Verified end to end: with the gate off the tool answers `unknown tool`, with it on the
  same call succeeds.
- **`lib/gates-patch.js`**, a dependency-free writer for that block: backup, temp file plus atomic
  rename, read-back verification, and restore on a failed check. The file it touches is the layer
  every plugin load passes through, so a half-written block would break the whole profile.
- **`POST /api/browser-playwright/gates`**, plus `allowEvaluate`, `allowCdp` and `patchGates` on
  `GET /api/browser-playwright/state`. The first two are the *effective* values published by the
  browser plugin itself (`runtime-state.publishGates`), the third is what this card's block says —
  the difference is the diagnostic when a switch looks inert.
- `npm test` and CI (Linux + Windows): the writer test needs no install and no browser.

### Changed

- The card now reads the effective gate values instead of assuming the package default, so it stays
  honest when a profile patch or the package decides something else.

## 0.1.0

### Added

- Initial card: `Allow the AI to drive pages` (the browser plugin's shared enable flag, applied
  without a restart) and the page-reading mode picker (compatible / smart).
- Split into its own single-entry package, because `dsh-client-modules` rejects a package mounted
  from multiple loader entries and the browser plugin is mounted as three.
