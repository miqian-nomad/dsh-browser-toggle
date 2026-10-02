/**
 * dsh-browser-toggle - Client half.
 *
 * Settings → Plugins card for the browser plugin. Manual __ModuleLoader__
 * shim, same shape as the other dsh-* panels: zero build step, inline
 * React.createElement. Talks to the host /api/browser-playwright/* routes via
 * fetch (GET polling, POST with the x-dsh-plugin CSRF header).
 *
 * Two user settings, both effective without a restart:
 *   1. availability — on/off, rendered with the same Switch the other panels use.
 *   2. 页面识别方式  — a choice between two ways of reading a page. Multi-choice
 *      settings use radio rows here (same pattern as dsh-search-switch's
 *      搜索提供方 card), not a switch: it reads as "pick one", not "turn on".
 *
 * 排版跟官方设置页同一套：--dsw-* 设计令牌 + client-ui-primitives 原子件，
 * 不再自带 font-family、不再写死颜色 / 字号（浅色深色自动跟随）。
 */
window.__ModuleLoader__.load({
    id: 'dsh-browser-toggle',
    factory: (require) => {
        const module = { exports: {} };
        const exports = module.exports;
        const React = require('react');
        const h = React.createElement;
        const { useEffect, useState, useRef } = React;

    // ---- 官方排版套件：与设置页其它面板同一套令牌 / 原子件 ----
    // 1) 不再覆盖 font-family：继承外壳的 --dsw-font-family
    //    （-apple-system / Segoe UI / PingFang SC / Microsoft YaHei ...）
    // 2) 颜色一律走 --dsw-alias-*，浅色 / 深色主题自动跟随
    // 3) 按钮 / 圆点 / 开关 / 标签直接用官方 @deepseek-ai/dsh-client-ui-primitives
    //    （静态基座模块，third-party client bundle 可直接 require；取不到时退回同令牌样式）
    const UI = (() => {
      try { return require('@deepseek-ai/dsh-client-ui-primitives') || {} } catch (e) { return {} }
    })()

    const T = {
      primary: 'var(--dsw-alias-label-primary)',
      secondary: 'var(--dsw-alias-label-secondary)',
      tertiary: 'var(--dsw-alias-label-tertiary)',
      border: 'var(--dsw-alias-border-l2)',
      borderL3: 'var(--dsw-alias-border-l3)',
      layer2: 'var(--dsw-alias-bg-layer-2)',
      success: 'var(--dsw-alias-state-success-primary)',
      warn: 'var(--dsw-alias-state-warn-primary)',
      error: 'var(--dsw-alias-state-error-primary)',
    }

    const S = {
      page: { display: 'flex', flexDirection: 'column', width: '100%' },
      title: { margin: '0 0 6px', fontSize: 16, fontWeight: 500, lineHeight: '24px', color: T.primary },
      intro: { margin: '0 0 16px', fontSize: 13, lineHeight: '20px', color: T.tertiary },
      list: { display: 'flex', flexDirection: 'column', gap: 8 },
      row: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: '0.5px solid ' + T.border, borderRadius: 12 },
      rowTitle: { fontSize: 14, fontWeight: 500, lineHeight: '22px', color: T.primary },
      rowDesc: { fontSize: 12, lineHeight: '18px', color: T.secondary },
      meta: { fontSize: 11, lineHeight: '16px', color: T.tertiary, marginTop: 2 },
      group: { margin: '18px 0 8px', fontSize: 13, fontWeight: 600, lineHeight: '20px', color: T.primary },
      groupCount: { fontWeight: 400, color: T.tertiary },
      footer: { marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
      tip: { fontSize: 12, lineHeight: '18px', color: T.tertiary },
      note: { margin: '6px 0 0', fontSize: 11, lineHeight: '16px', color: T.tertiary },
      msg: { marginTop: 10, fontSize: 12, lineHeight: '18px', minHeight: 18, color: T.error },
    }

    function Btn({ danger, ...props }) {
      const style = danger ? { color: T.error } : undefined
      // 设置页自己的动作按钮是 outline + sm（实测「打开配置文件」就是这一套）——
      // ghost 在这页会显得轻一档，跟旁边的官方按钮不是一路。
      if (UI.Button) return h(UI.Button, { variant: 'outline', size: 'sm', ...props, style })
      return h('button', {
        type: 'button', ...props,
        style: {
          height: 28, padding: '0 10px', border: '0.5px solid ' + T.borderL3, borderRadius: 14,
          background: 'transparent', font: 'inherit', fontSize: 12, lineHeight: '18px',
          color: danger ? T.error : T.primary, cursor: props.disabled ? 'default' : 'pointer',
          opacity: props.disabled ? 0.4 : 1,
        },
      })
    }

    function Dot({ state }) {
      if (UI.StateDot) return h(UI.StateDot, { state })
      const color = { done: T.success, warning: T.warn, error: T.error }[state] || T.tertiary
      return h('span', { style: { width: 8, height: 8, borderRadius: '50%', flex: 'none', background: color } })
    }

    function Toggle({ checked, onChange, label, disabled }) {
      if (UI.Switch) return h(UI.Switch, { checked, onChange, label, disabled })
      return h('button', {
        type: 'button', role: 'switch', 'aria-checked': checked, 'aria-label': label, disabled,
        onClick: () => onChange(!checked),
        style: { width: 36, height: 20, flex: 'none', padding: 2, border: 'none', borderRadius: 10, background: checked ? T.primary : T.borderL3, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 },
      }, h('span', { style: { display: 'block', width: 16, height: 16, borderRadius: '50%', background: 'var(--dsw-alias-label-primary-foreground)', transform: checked ? 'translateX(16px)' : 'none', transition: 'transform 120ms ease' } }))
    }

    /** 官方 Tag：像「已启用 / 已禁用」这类状态小标记（以前是行内一段灰字）。 */
    function Tag(props) {
      if (UI.Tag) return h(UI.Tag, { tone: props.tone || 'outline' }, props.children)
      return h('span', { style: { fontSize: 11, lineHeight: '16px', color: T.tertiary, marginRight: 6 } }, props.children)
    }

    /** 官方 DisclosureRow：长说明默认折叠（首屏只留结论）。 */
    function Notes(props) {
      const [open, setOpen] = useState(false)
      if (UI.DisclosureRow) {
        return h(UI.DisclosureRow, {
          title: props.title,
          open: open,
          expandable: true,
          expandOnRowClick: true,
          onToggle: () => setOpen(!open),
        }, open ? props.children : null)
      }
      return h('div', null, props.children)
    }

    // 单选行：与 dsh-search-switch 的 RadioRow 同一套（role=radio / 选中描边加粗 /
    // 圆点标记 / 键盘可操作），所以两张卡片放在一起看不出是两个人写的。
    function RadioRow({ p, selected, disabled, onPick }) {
      return h('div', {
        role: 'radio',
        'aria-checked': selected,
        'aria-label': p.label,
        tabIndex: disabled ? -1 : 0,
        onClick: () => { if (!disabled) onPick(p.id) },
        onKeyDown: (e) => {
          if (disabled) return
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(p.id) }
        },
        style: {
          display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px',
          border: (selected ? '1px' : '0.5px') + ' solid ' + (selected ? T.primary : T.border),
          borderRadius: 12,
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled && !selected ? 0.6 : 1,
        },
      }, [
        h('span', {
          key: 'mark',
          style: {
            width: 16, height: 16, flex: 'none', marginTop: 2, borderRadius: '50%',
            border: '1.5px solid ' + (selected ? T.primary : T.borderL3),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          },
        }, selected ? h('span', { style: { width: 8, height: 8, borderRadius: '50%', background: T.primary } }) : null),
        h('div', { key: 'text', style: { flex: 1, minWidth: 0 } }, [
          h('div', { key: 'label', style: S.rowTitle }, p.label),
          p.hint ? h('div', { key: 'hint', style: S.rowDesc }, p.hint) : null,
        ]),
        selected ? h(Dot, { key: 'dot', state: 'done' }) : null,
      ])
    }

        const API = '/api/browser-playwright';
        const HEADER = 'browser-toggle';

        // 两种"看网页"的方式。写成用户能懂的话，不出现 legacy / aria / 引擎 这些词。
        const ENGINE_OPTIONS = [
            {
                id: 'legacy',
                label: '兼容模式',
                hint: '插件自己去找页面上的按钮和输入框。用得最久、测得最多，遇到奇怪的网站最不容易出问题。',
            },
            {
                id: 'aria',
                label: '智能模式',
                hint: '改用浏览器官方的"页面说明书"（和读屏软件看的是同一份）。菜单、弹窗、动态加载多的网站通常更准；万一读不出来，它会自动退回兼容模式。',
            },
        ]

        // 两个"强力工具"：默认关闭，用户想要才打开。写的都是人话，不出现 evaluate/cdp。
        const GATE_ROWS = [
            {
                key: 'allowEvaluate',
                label: '允许在页面里执行任意 JavaScript',
                hint: '打开后 AI 能在任意网页里运行脚本：能读走页面上的任何内容，也能用你的登录状态去点、去填、去提交。真正需要时才打开。',
            },
            {
                key: 'allowCdp',
                label: '允许原始 CDP 调试协议',
                hint: '给排查疑难页面用：只放行"查看类"和"模拟输入类"命令，读取 Cookie/存储、改网络、动安全设置这类命令一律被拦住。',
            },
        ]

        async function api(path, method, body) {
            const opts = { method, headers: {} };
            if (method === 'POST') {
                opts.headers['Content-Type'] = 'application/json';
                opts.headers['x-dsh-plugin'] = HEADER;
                if (body !== undefined)
                    opts.body = JSON.stringify(body);
            }
            else {
                opts.headers['Cache-Control'] = 'no-store';
            }
            const res = await fetch(API + path, opts);
            return res.json();
        }

        function BrowserPanel() {
            const [enabled, setEnabled] = useState(null);
            const [engine, setEngine] = useState(null);
            const [engineUserChosen, setEngineUserChosen] = useState(false);
            const [gates, setGates] = useState({ allowEvaluate: null, allowCdp: null });
            const [busy, setBusy] = useState(false);
            const [msg, setMsg] = useState('');
            const mountedRef = useRef(true);

            const refresh = async () => {
                try {
                    const s = await api('/state', 'GET');
                    if (!mountedRef.current) return;
                    if (typeof s.enabled === 'boolean')
                        setEnabled(s.enabled);
                    if (typeof s.engine === 'string')
                        setEngine(s.engine);
                    setEngineUserChosen(s.engineUserChosen === true);
                    setGates({
                        allowEvaluate: typeof s.allowEvaluate === 'boolean' ? s.allowEvaluate : null,
                        allowCdp: typeof s.allowCdp === 'boolean' ? s.allowCdp : null,
                    });
                }
                catch (error) {
                    if (mountedRef.current)
                        setMsg('状态获取失败：' + (error?.message ?? String(error)));
                }
            };

            useEffect(() => {
                mountedRef.current = true;
                refresh();
                const timer = setInterval(refresh, 5000);
                return () => {
                    mountedRef.current = false;
                    clearInterval(timer);
                };
            }, []);

            const applyEnabled = async (next) => {
                if (enabled === null || busy || next === enabled)
                    return;
                setBusy(true);
                setMsg('');
                try {
                    const r = await api('/toggle', 'POST', { enabled: next });
                    if (typeof r.enabled === 'boolean')
                        setEnabled(r.enabled);
                    setMsg(r.changed
                        ? (next ? '已启用：AI 可以替你操作网页。' : '已禁用：AI 不再操作网页，已打开的窗口会自动关闭（登录状态保留）。')
                        : '状态未变化');
                }
                catch (error) {
                    setMsg('切换失败：' + (error?.message ?? String(error)));
                }
                finally {
                    setBusy(false);
                }
            };

            const chooseEngine = async (next) => {
                if (engine === null || busy || next === engine)
                    return;
                setBusy(true);
                setMsg('');
                try {
                    const r = await api('/engine', 'POST', { engine: next });
                    if (typeof r.engine === 'string')
                        setEngine(r.engine);
                    const picked = ENGINE_OPTIONS.find((o) => o.id === r.engine) || {};
                    setEngineUserChosen(true);
                    setMsg(r.changed
                        ? '已切到「' + (picked.label || r.engine) + '」，下一步操作就生效，不用重启。'
                        : '状态未变化');
                }
                catch (error) {
                    setMsg('切换失败：' + (error?.message ?? String(error)));
                }
                finally {
                    setBusy(false);
                }
            };

            const applyGates = async (key, next) => {
                if (gates[key] === null || busy || next === gates[key])
                    return;
                setBusy(true);
                setMsg('');
                // Send both: the host writes one managed block for the pair.
                const payload = {
                    allowEvaluate: gates.allowEvaluate === true,
                    allowCdp: gates.allowCdp === true,
                };
                payload[key] = next;
                try {
                    const r = await api('/gates', 'POST', payload);
                    if (r && r.error)
                        throw new Error(r.error.message || r.error.code || 'unknown');
                    setGates({ allowEvaluate: r.allowEvaluate === true, allowCdp: r.allowCdp === true });
                    setMsg(r.changed
                        ? (next
                            ? '已打开：' + (key === 'allowEvaluate' ? '页面任意 JS' : '原始 CDP') + '。工具会在热重载后出现（约 1-2 秒）；若一直没出现，重启一次 DSH。'
                            : '已关闭。工具会在热重载后消失；若还在，重启一次 DSH。')
                        : '状态未变化');
                }
                catch (error) {
                    setMsg('切换失败：' + (error?.message ?? String(error)));
                }
                finally {
                    setBusy(false);
                }
            };

            const state = enabled === null ? 'ongoing' : (enabled ? 'done' : 'idle');
            const gateState = (key) => (gates[key] === null ? 'ongoing' : (gates[key] ? 'done' : 'idle'));
            const gatesOn = GATE_ROWS.filter((row) => gates[row.key] === true).length;
            const statusLabel = enabled === null ? '读取中…' : (enabled ? '已启用' : '已禁用');
            const current = ENGINE_OPTIONS.find((o) => o.id === engine) || null;

            return h('div', { style: S.page }, [
                h('h2', { key: 'title', style: S.title }, '浏览器'),
                h('p', { key: 'intro', style: S.intro },
                    '让 AI 用你的登录状态替你上网办事（查后台、填表、抓列表）。这里的改动立刻生效，不需要重启。'),
                h('div', { key: 'row', style: S.row }, [
                    h(Dot, { key: 'dot', state }),
                    h('div', { key: 'text', style: { flex: 1, minWidth: 0 } }, [
                        h('div', { key: 'label', style: S.rowTitle }, '允许 AI 操作网页'),
                        h('div', { key: 'desc', style: S.rowDesc }, [
                            h(Tag, { key: 'status' }, statusLabel),
                            '　关闭后已打开的窗口会自动关闭，登录状态会保留。',
                        ]),
                    ]),
                    h(Toggle, {
                        key: 'toggle',
                        checked: enabled === true,
                        onChange: applyEnabled,
                        disabled: enabled === null || busy,
                        label: '允许 AI 操作网页',
                    }),
                ]),
                h('div', { key: 'group', style: S.group }, '页面识别方式'),
                h(Notes, { key: 'groupNotes', title: '说明' },
                    h('p', { style: S.note },
                        '决定它怎么"看"一个网页：页面上有哪些能点的、能填的。两种都能正常用，选哪个看你常去的网站。')),
                h('div', { key: 'engines', style: { ...S.list, marginTop: 8 } }, ENGINE_OPTIONS.map((o) =>
                    h(RadioRow, {
                        key: o.id,
                        p: o,
                        selected: engine === o.id,
                        disabled: engine === null || busy,
                        onPick: chooseEngine,
                    }))),
                h('div', { key: 'footer', style: S.footer }, [
                    h(Btn, { key: 'refresh', onClick: refresh, disabled: busy }, '刷新状态'),
                    current
                        ? h('span', { key: 'cur', style: S.tip },
                            '当前：' + current.label + (engineUserChosen ? '（你选的）' : '（默认）'))
                        : null,
                ]),
                h('div', { key: 'gatesGroup', style: S.group }, '强力工具（默认关闭）'),
                h(Notes, { key: 'gatesNotes', title: '说明' },
                    h('p', { style: S.note },
                        '这两个开关控制的是"能力"，不是效果微调：打开"任意 JavaScript"就等于把页面里的东西都交给 AI。'
                        + '插件包里默认关闭 —— 因为包是发给每个安装者的，默认打开等于替所有人做了这个决定；'
                        + '这里打开的是你自己机器上的选择，记在你自己机器的配置层里。')),
                h('div', { key: 'gates', style: { ...S.list, marginTop: 8 } }, GATE_ROWS.map((row) =>
                    h('div', { key: row.key, style: S.row }, [
                        h(Dot, { key: 'dot', state: gateState(row.key) }),
                        h('div', { key: 'text', style: { flex: 1, minWidth: 0 } }, [
                            h('div', { key: 'label', style: S.rowTitle }, row.label),
                            h('div', { key: 'desc', style: S.rowDesc }, row.hint),
                        ]),
                        h(Toggle, {
                            key: 'toggle',
                            checked: gates[row.key] === true,
                            onChange: (next) => applyGates(row.key, next),
                            disabled: gates[row.key] === null || busy,
                            label: row.label,
                        }),
                    ]))),
                h('div', { key: 'gatesFooter', style: S.footer },
                    gates.allowEvaluate === null && gates.allowCdp === null
                        ? h('span', { key: 'unknown', style: S.tip }, '当前：读取不到（这个 profile 里的插件版本还没上报闸门状态）')
                        : h('span', { key: 'sum', style: S.tip }, '当前：' + (gatesOn === 0 ? '都关着' : gatesOn + ' 个开着'))),
                msg ? h('div', { key: 'msg', style: S.msg }, msg) : null,
            ]);
        }

        function apply(ctx) {
            ctx.effect(() =>
                ctx.slots.inject('settings.section', () =>
                    ctx.slots.register(
                        { name: 'settings.section', id: 'browser-toggle', order: 106, label: () => '浏览器' },
                        BrowserPanel,
                    ),
                ),
            );
        }

        exports.apply = apply;
        exports.inject = ['slots'];
        return module.exports;
    },
});
