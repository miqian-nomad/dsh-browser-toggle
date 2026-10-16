/**
 * /api/browser-playwright/logins 的测试（以及 /state 的防伪头补齐）。
 *
 * 用假宿主把路由抓下来直接调用 —— 这样"不带防伪头必须 403"这条安全断言是真的在跑，而不是靠读代码推断。
 * 2026-10-16：加这个功能时发现 /state 此前只有 POST 校验防伪头，GET 是裸奔的，一并补上并在这里钉住。
 *
 * 依赖处理：本测试需要主插件包（``dsh-browser-playwright-codex``）。本地是 ``link:`` 指向开发目录，
 * 而 **CI 只 checkout 本仓库、不装主插件**，所以解析不到时**明确 skip**（2026-10-16 第一次跑 CI 就是
 * 因为这个红的）。等主插件发布后把 ``dsh-browser-playwright-codex`` 加进 devDependencies，CI 就会真跑它。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const PREFIX = '/api/browser-playwright'
const HEADER = 'x-dsh-plugin'
const SKIP_REASON = '主插件包 dsh-browser-playwright-codex 不在依赖里（CI 只装本仓库依赖），路由测试跳过'

let publishLoginSites
let apply
let available = false
try {
  ;({ publishLoginSites } = await import('dsh-browser-playwright-codex/runtime-state'))
  ;({ apply } = await import('../lib/index.js'))
  available = true
} catch {
  available = false
}

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

test('GET /logins 不带防伪头一律 403（这份 payload 是用户的登录站点名单）', (t) => {
  if (!available) return t.skip(SKIP_REASON)
  const routes = mount()
  const handler = routes.get(`${PREFIX}/logins`)
  assert.ok(handler !== undefined, '/logins 路由必须注册')
  return call(handler).then((denied) => {
    assert.equal(denied.status, 403)
    assert.equal(denied.payload.error.code, 'CSRF')
  })
})

test('GET /logins 带防伪头时回传 provider 发布的那份摘要', (t) => {
  if (!available) return t.skip(SKIP_REASON)
  const routes = mount()
  publishLoginSites({
    source: 'snapshot',
    capturedAt: 1_700_000_000_000,
    cookies: 2,
    total: 1,
    likelyTotal: 1,
    thirdPartyTotal: 0,
    attribution: 'unfiltered',
    sites: [
      {
        domain: 'github.com',
        cookies: 2,
        httpOnly: 2,
        longLived: 1,
        sessionLike: 0,
        tokenLike: 0,
        likely: true,
        signals: ['httpOnly'],
        alias: 'GitHub（代码托管）',
        group: { key: 'microsoft', label: '微软系' },
      },
    ],
  })
  return call(routes.get(`${PREFIX}/logins`), { header: true }).then((ok) => {
    assert.equal(ok.status, 200)
    assert.equal(ok.payload.logins.source, 'snapshot')
    assert.equal(ok.payload.logins.sites[0].domain, 'github.com')
    assert.equal(ok.payload.logins.sites[0].likely, true)
    assert.equal(ok.payload.logins.sites[0].alias, 'GitHub（代码托管）')
    // 端到端也不许出现 cookie 名字或值
    const serialized = JSON.stringify(ok.payload)
    for (const forbidden of ['value', 'sid', 'sekrit']) {
      assert.ok(!serialized.includes(forbidden), '路由回传内容里不该有 ' + forbidden)
    }
  })
})

test('POST /logins 被拒绝（只读路由）', (t) => {
  if (!available) return t.skip(SKIP_REASON)
  const routes = mount()
  return call(routes.get(`${PREFIX}/logins`), { method: 'POST', header: true }).then((res) => {
    assert.equal(res.status, 405)
  })
})

test('/state 也要求防伪头（补掉的缺口）', (t) => {
  if (!available) return t.skip(SKIP_REASON)
  const routes = mount()
  const handler = routes.get(`${PREFIX}/state`)
  assert.ok(handler !== undefined)
  return call(handler).then((denied) => {
    assert.equal(denied.status, 403, '/state 不带防伪头必须 403')
    return call(handler, { header: true }).then((ok) => {
      assert.equal(ok.status, 200, '/state 带防伪头必须正常返回')
    })
  })
})