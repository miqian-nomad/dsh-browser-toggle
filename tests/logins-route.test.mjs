/**
 * /api/browser-playwright/logins 的测试（以及 /state 的防伪头补齐）。
 *
 * 用假宿主把路由抓下来直接调用 —— 这样"不带防伪头必须 403"这条安全断言是真的在跑，
 * 而不是靠读代码推断。2026-10-16：加这个功能时发现 /state 此前只有 POST 校验防伪头，
 * GET 是裸奔的，一并补上并在这里钉住。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { publishLoginSites } from 'dsh-browser-playwright-codex/runtime-state'
import { apply } from '../lib/index.js'

const PREFIX = '/api/browser-playwright'
const HEADER = 'x-dsh-plugin'

/** Capture the handlers a fake host registers, the way the real loader would. */
function mount() {
  const routes = new Map()
  const ctx = {
    effect: (fn) => fn(),
    webServer: {
      register: (route) => {
        routes.set(route.path, route.handler)
      },
    },
  }
  apply(ctx)
  return routes
}

function fakeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(key, value) {
      this.headers[key] = value
    },
    end(chunk) {
      this.body = String(chunk ?? '')
    },
  }
}

async function call(handler, { method = 'GET', header = false } = {}) {
  const res = fakeRes()
  await handler({ method, headers: header ? { [HEADER]: 'browser-toggle' } : {} }, res)
  return { status: res.statusCode, payload: JSON.parse(res.body) }
}

test('GET /logins 不带防伪头一律 403（这份 payload 是用户的登录站点名单）', async () => {
  const routes = mount()
  const handler = routes.get(`${PREFIX}/logins`)
  assert.ok(handler !== undefined, '/logins 路由必须注册')
  const denied = await call(handler)
  assert.equal(denied.status, 403)
  assert.equal(denied.payload.error.code, 'CSRF')
})

test('GET /logins 带防伪头时回传 provider 发布的那份摘要', async () => {
  const routes = mount()
  publishLoginSites({
    source: 'snapshot',
    capturedAt: 1_700_000_000_000,
    cookies: 2,
    total: 1,
    sites: [
      { domain: 'github.com', cookies: 2, httpOnly: 2, longLived: 1, sessionLike: 0, likely: true, signals: ['httpOnly'] },
    ],
  })
  const ok = await call(routes.get(`${PREFIX}/logins`), { header: true })
  assert.equal(ok.status, 200)
  assert.equal(ok.payload.logins.source, 'snapshot')
  assert.equal(ok.payload.logins.sites[0].domain, 'github.com')
  assert.equal(ok.payload.logins.sites[0].likely, true)
  // 端到端也不许出现 cookie 名字或值
  const serialized = JSON.stringify(ok.payload)
  for (const forbidden of ['value', 'sid', 'sekrit']) {
    assert.ok(!serialized.includes(forbidden), '路由回传内容里不该有 ' + forbidden)
  }
})

test('POST /logins 被拒绝（只读路由）', async () => {
  const routes = mount()
  const res = await call(routes.get(`${PREFIX}/logins`), { method: 'POST', header: true })
  assert.equal(res.status, 405)
})

test('/state 也要求防伪头（补掉的缺口）', async () => {
  const routes = mount()
  const handler = routes.get(`${PREFIX}/state`)
  assert.ok(handler !== undefined)
  const denied = await call(handler)
  assert.equal(denied.status, 403, '/state 不带防伪头必须 403')
  const ok = await call(handler, { header: true })
  assert.equal(ok.status, 200, '/state 带防伪头必须正常返回')
})
