/**
 * dsh-browser-toggle - home-level patch writer.
 *
 * Reads and rewrites ONE managed block inside the home-level cordis.patch.yml
 * (the patch layer with the highest priority, so the user's own choice wins over
 * any profile layer and over the package default). Everything outside the block
 * is preserved byte for byte.
 *
 * Why this is its own module: a half-written patch layer breaks every plugin load
 * in the profile, so this file is deliberately dependency-free (node builtins
 * only) and therefore testable on its own — see the sibling self-test usage in
 * the plugin README. The host half keeps the HTTP/CSRF concerns.
 */
import { readFile, writeFile, rename, copyFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Managed block markers: everything between them belongs to this plugin. */
export const BEGIN = '# >>> dsh-browser-toggle: 强力工具闸门（本块由设置页维护，也可手工编辑）>>>';
export const END = '# <<< dsh-browser-toggle <<<';

/** Path of the home-level patch layer (highest priority among patch files). */
export function homePatchPath(env = process.env) {
    return join(env.DSH_HOME || join(homedir(), '.dsh'), 'cordis.patch.yml');
}

/**
 * The managed block. `config` is replaced wholesale by the loader, so every key
 * the tool family reads is listed here — a shorter block would silently reset the
 * others to their defaults.
 */
export function renderGatesBlock(allowEvaluate, allowCdp) {
    return [
        BEGIN,
        '# allowEvaluate: 注册 browser_evaluate（页面任意 JS，能用你的登录态操作网站）',
        '# allowCdp:      注册 browser_cdp（原始 CDP，仅放行检查与输入模拟）',
        '# 包内默认关闭；这里的值就是用户自己的选择。改完由热重载生效。',
        '- id: browser-tool',
        '  name: "dsh-browser-playwright-codex/tool"',
        '  config:',
        '    toolPrefix: "browser_"',
        '    allowEvaluate: ' + (allowEvaluate ? 'true' : 'false'),
        '    allowCdp: ' + (allowCdp ? 'true' : 'false'),
        '    registerDisabledTools: false',
        '    maxWaitMs: 60000',
        END,
        '',
    ].join('\n');
}

/** Merge the managed block into `original`, replacing an existing one in place. */
export function mergeGatesBlock(original, allowEvaluate, allowCdp) {
    const block = renderGatesBlock(allowEvaluate, allowCdp);
    const beginIdx = original.indexOf(BEGIN);
    const endIdx = original.indexOf(END);
    if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
        let after = endIdx + END.length;
        if (original[after] === '\n') after += 1;
        return original.slice(0, beginIdx) + block + original.slice(after);
    }
    return (original === '' || original.endsWith('\n') ? original : original + '\n') + '\n' + block;
}

/** Read the current managed block, or undefined when there is none. */
export function parseGatesBlock(text) {
    const beginIdx = text.indexOf(BEGIN);
    const endIdx = text.indexOf(END);
    if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) return undefined;
    const body = text.slice(beginIdx, endIdx);
    const evaluate = /allowEvaluate:\s*(true|false)/.exec(body);
    const cdp = /allowCdp:\s*(true|false)/.exec(body);
    if (evaluate === null || cdp === null) return undefined;
    return { allowEvaluate: evaluate[1] === 'true', allowCdp: cdp[1] === 'true' };
}

/**
 * Write both gates into the home-level patch. Backup first, atomic rename, then
 * read back and check; on a failed check the previous bytes are restored.
 */
export async function writeGates(allowEvaluate, allowCdp, env = process.env) {
    const file = homePatchPath(env);
    let original = '';
    try {
        original = await readFile(file, 'utf8');
    }
    catch {
        original = '';
    }
    const next = mergeGatesBlock(original, allowEvaluate, allowCdp);
    if (original !== '') await copyFile(file, file + '.bak-browser-toggle').catch(() => { });
    const tmp = file + '.tmp-browser-toggle';
    await writeFile(tmp, next, 'utf8');
    await rename(tmp, file);
    const check = await readFile(file, 'utf8');
    const parsed = parseGatesBlock(check);
    if (parsed === undefined || parsed.allowEvaluate !== allowEvaluate || parsed.allowCdp !== allowCdp) {
        if (original !== '') {
            await writeFile(file, original, 'utf8');
            throw new Error('patch self-check failed after write; previous content restored');
        }
        throw new Error('patch self-check failed after write');
    }
    return { patch: file, allowEvaluate, allowCdp };
}
