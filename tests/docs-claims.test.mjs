/**
 * 配套件的文档承诺，由它自己的 CI 验证（主插件那边的跨仓检查只在本地双检出时跑）。
 *
 * 2026-10-16：主插件第一次跑 CI 就红了 —— 那条"跨文档一致性"测试要读邻座仓库的文件，而 CI 只
 * checkout 一个仓库。跨仓检查留在本地，本仓能验的部分就放在这里。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (rel) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8')

test('docs: 两份文档都写明 /logins 要求的防伪头，并承诺模型看不到这份名单', () => {
  const failures = []
  for (const doc of ['README.md', '中文说明.md']) {
    const text = read(doc)
    if (!/x-dsh-plugin/.test(text)) failures.push(doc + ' 没提 /logins 要求的 x-dsh-plugin 防伪头')
    if (!/模型看不到|the model cannot|model cannot read/.test(text)) {
      failures.push(doc + ' 没承诺"模型看不到这份名单"')
    }
  }
  assert.deepEqual(failures, [], failures.join('; '))
})

test('docs: 两份文档都写明"同一家公司的域折叠成一行"与"说明 > 标题 > 域名"的显示规则', () => {
  const failures = []
  for (const doc of ['README.md', '中文说明.md']) {
    const text = read(doc)
    if (!/折叠成一行|collapse into one row/i.test(text)) failures.push(doc + ' 没说清折叠成一行')
    if (!/说明优先|alias|对照表|curated/.test(text)) failures.push(doc + ' 没说清"域名说明"从哪来')
  }
  assert.deepEqual(failures, [], failures.join('; '))
})
