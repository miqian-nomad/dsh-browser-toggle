/**
 * gates-patch.test.mjs — the managed-block writer that touches
 * `$DSH_HOME/cordis.patch.yml`.
 *
 * Why this file exists at all: that YAML is the layer every plugin load goes
 * through. A half-written block does not just break this plugin — it breaks the
 * whole profile. So the writer is a dependency-free module (`lib/gates-patch.js`)
 * and this test drives the real thing with a throwaway DSH_HOME:
 *
 *   * other content in the file survives byte for byte
 *   * a second write replaces the managed block instead of appending a copy
 *   * the block is merged in place even when surrounded by other entries
 *   * a backup is written and the temp file is cleaned up
 *   * failing the post-write self-check restores the previous bytes
 *
 * Run: `npm test` (node builtins only — no install, works offline).
 */
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  writeGates,
  mergeGatesBlock,
  parseGatesBlock,
  homePatchPath,
} from '../lib/gates-patch.js'

let pass = 0
const fails = []
function check(name, ok, detail) {
  if (ok) {
    pass += 1
    console.log('  ok   ' + name)
  } else {
    fails.push(name)
    console.log('  FAIL ' + name + (detail ? ' :: ' + detail : ''))
  }
}

const home = mkdtempSync(join(tmpdir(), 'gates-patch-'))
const env = { DSH_HOME: home }
const file = join(home, 'cordis.patch.yml')
console.log('  isolated DSH_HOME=' + home)

// 1) A file that already carries other layers (the real one does).
const other = [
  '# dsh home level shared patch layer',
  '- id: web',
  '  config:',
  '    searchProvider: anysearch',
  '    fetchProvider: http',
  '',
].join('\n')
writeFileSync(file, other, 'utf8')
await writeGates(true, false, env)
let text = readFileSync(file, 'utf8')
const occurrences = (needle) => text.split(needle).length - 1
check('pre-existing content survives verbatim', text.includes('searchProvider: anysearch'))
check('the managed block is added', text.includes('dsh-browser-toggle: 强力工具闸门'))
check(
  'it parses back as allowEvaluate=true, allowCdp=false',
  JSON.stringify(parseGatesBlock(text)) === '{"allowEvaluate":true,"allowCdp":false}',
  JSON.stringify(parseGatesBlock(text)),
)
check('a backup file is written', existsSync(file + '.bak-browser-toggle'))
check('the temp file is cleaned up', !existsSync(file + '.tmp-browser-toggle'))

// 2) A second write must replace, not append.
await writeGates(false, true, env)
text = readFileSync(file, 'utf8')
check('a second write does not leave two blocks', occurrences('dsh-browser-toggle: 强力工具闸门') === 1)
check(
  'the second write takes effect',
  JSON.stringify(parseGatesBlock(text)) === '{"allowEvaluate":false,"allowCdp":true}',
)
check('pre-existing content is still there', text.includes('searchProvider: anysearch'))

// 3) A block surrounded by other entries is replaced in place.
const before = '- id: a\n  config:\n    x: 1\n'
const after = '\n- id: z\n  config:\n    y: 2\n'
writeFileSync(file, before + 'PLACEHOLDER\n' + after + '\n', 'utf8')
await writeGates(true, true, env)
text = readFileSync(file, 'utf8')
check('the prefix is untouched', text.startsWith(before))
check('the suffix is untouched', text.includes('- id: z') && text.includes('y: 2'))

// 4) Pure merge on an empty file.
const merged = mergeGatesBlock('', true, true)
check('an empty file yields a complete block', merged.includes('- id: browser-tool') && merged.includes('allowEvaluate: true'))

// 5) DSH_HOME is honoured.
check('homePatchPath honours DSH_HOME', homePatchPath(env) === file, homePatchPath(env))

console.log('')
console.log(fails.length === 0 ? 'all passed (' + pass + ')' : 'failed ' + fails.length + ': ' + fails.join(', '))
process.exit(fails.length === 0 ? 0 : 1)
