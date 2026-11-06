/**
 * 看板**渲染层**的最小载具（`DASH-10` / `DASH-11` 用；不是用例，不进分母）。
 *
 * 它回答的是"那段真代码跑起来会怎样"，不是"源码里有没有那句话"：
 *   · `client.js` 是一个浏览器包 —— `window.__ModuleLoader__.load({id, factory})`，
 *     工厂里 `require("react")` / `require("react-dom")` / `require(primitives)`。
 *     这里给一副**假装载器 + 假 require**，把**盘上那份真源码**装起来（`node:vm`，不碰盘）。
 *   · 再给一副**最小 React**：`useState` / `useRef` / `useEffect` / `useLayoutEffect` 按调用次序
 *     分配槽位、`deps` 浅比较、effect 在 commit 之后跑（`flush()`）；`jsx/jsxs` 直接建树；
 *     `createPortal` 返回节点本身。于是可以**真的点一次按钮**、真的让读盘的 promise 落定、真的再看一次树。
 *   · 读数只取三样：**抛没抛**（同步抛出去 = React 会把整个槽位拆掉）、**树里有没有那个节点**、
 *     **面板拿到的 `style` 是什么**。
 *
 * 🔴 它**不是**要证明"浏览器里长得对"（那归 GUI 清单，人点一次）。它只证明这一条机器事实：
 *   读盘失败**没有把组件带走**（按钮还在 + 出现错误节点），而成功那一支仍然 `JSON.parse` 出快照。
 *
 * ⚠️ 假 React 的边界（写清楚，免得读的人把它当浏览器）：不做 reconciliation / 不 diff /
 *    不认 `key` / 不跑 layout 时机（`useLayoutEffect` 与 `useEffect` 同批跑）/ 不合成事件。
 *    组件里每一步只依赖上面这几样，所以这几步是真的。
 */
import vm from 'node:vm'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { PATHS } from './env.mjs'

/**
 * 故障那一版的提交（`d586215` = 修它的那个提交；`^` 就是**出故障的那一版**）。
 *
 * 为什么把哈希写在这里：这两条判据要能证明"**它抓得住那次真故障**"。合成样本只能证明判据会翻面，
 * 抓不住"我造的那个假缺陷与现场那个真缺陷是不是同一个"。`d586215^` 是**不变的历史**（不是"会变的东西"）。
 * ⚠️ 拿不到它（副本没有 `.git`）⇒ 那一腿记 **HOLD**，不当绿（照 `dash06` 的 `preChangePatch` 口径）。
 */
export const PRE_FAILURE_COMMIT = 'd586215'
/** 看板渲染层在仓库里的相对路径（`git show` 用）。 */
export const CLIENT_REL = 'presets/agenia/client-ui-dashboard/lib/client.js'

/** `err` → 一句人话（判据与读数都用它，别在两处各写一种取法）。 */
export const messageOf = (err) => String(err && err.message !== undefined ? err.message : err)

/** `deps` 浅比较（`undefined` ⇒ 每次都跑，与 React 一致；其余按 `Object.is`）。 */
function depsEqual(prev, next) {
  if (prev === undefined || next === undefined) return false
  if (!Array.isArray(prev) || !Array.isArray(next) || prev.length !== next.length) return false
  return prev.every((value, i) => Object.is(value, next[i]))
}

/**
 * 造一副渲染器。**一个现场一副** —— hook 槽位（`open` / `view` / `failure`）是这一副的状态，
 * 跨现场复用会把上一个现场的状态带进来。
 *
 * 槽位按**组件函数**分桶（`store: Map<fn, slots[]>`），`cursor` 每次进入组件重置 ——
 * 与 React 的"同一位置同一顺序"是同一件事的最小版。
 */
function createRenderer(reactor) {
  const store = new Map()
  const log = { threw: [], renders: 0 }

  const instanceOf = (fn) => {
    if (!store.has(fn)) store.set(fn, { slots: [], cursor: 0 })
    return store.get(fn)
  }

  /** 一个 hook 槽：没有就建（`make()` 只跑一次），有就取回来。 */
  const slotAt = (fn, make) => {
    const inst = instanceOf(fn)
    const index = inst.cursor++
    if (!(index in inst.slots)) inst.slots[index] = make()
    return { inst, index, slot: inst.slots[index] }
  }

  let queue = []
  let dirty = false

  const renderer = {
    /** 直接调用一个组件函数（顶层 `DashboardAction` 走这里，子组件走 `renderChild`）。 */
    render(Component, props) {
      log.renders += 1
      const inst = instanceOf(Component)
      inst.cursor = 0
      const outer = reactor.current
      reactor.current = Component
      try {
        return { tree: Component(props), threw: null }
      } catch (err) {
        log.threw.push({ where: 'render', message: messageOf(err) })
        return { tree: null, threw: err }
      } finally {
        reactor.current = outer
      }
    },

    /** `jsx(<子组件>, …)` 那一步：同一副渲染器里往下渲染一层。 */
    renderChild(Component, props) {
      const rendered = renderer.render(Component, props)
      if (rendered.threw !== null) throw rendered.threw
      return rendered.tree
    },

    useState(initial) {
      const { slot } = slotAt(reactor.current, () => ({ value: typeof initial === 'function' ? initial() : initial }))
      const set = (next) => {
        slot.value = typeof next === 'function' ? next(slot.value) : next
        dirty = true
      }
      return [slot.value, set]
    },

    useRef(initial) {
      const { slot } = slotAt(reactor.current, () => ({ current: initial === undefined ? null : initial }))
      return slot
    },

    effect(fn, deps) {
      const { inst, index, slot } = slotAt(reactor.current, () => ({ deps: undefined, queued: false }))
      if (slot.queued) return
      slot.queued = true
      queue.push({ inst, index, fn, deps })
    },

    /**
     * commit 之后的 effect。`deps` 没变就不跑（否则"点一次"会反复重读、把错误态 `setFailure(null)` 洗掉）。
     * 同步抛出来的错误**收在这里**（`log.threw` + `threw`）—— 在 React 里那一下就是槽位被拆掉。
     */
    flush() {
      const pending = queue
      queue = []
      const cleanups = []
      let threw = null
      for (const item of pending) {
        const slot = item.inst.slots[item.index]
        slot.queued = false
        if (depsEqual(slot.deps, item.deps)) continue
        slot.deps = item.deps
        try {
          const cleanup = item.fn()
          if (typeof cleanup === 'function') cleanups.push(cleanup)
        } catch (err) {
          threw = err
          log.threw.push({ where: 'effect', message: messageOf(err) })
          break
        }
      }
      const wasDirty = dirty
      dirty = false
      return { threw, cleanups, dirty: wasDirty }
    },

    get dirty() {
      return dirty
    },
  }
  return { renderer, log }
}

/** 建树的 stub：函数型 `type` 当组件往下渲染，其余当宿主节点原样留着。 */
function makeJsx(reactor) {
  return (type, props) => {
    const given = props ?? {}
    if (typeof type === 'function') return reactor.active.renderChild(type, given)
    return { type, props: given }
  }
}

/**
 * 把一份 `client.js` 装起来。
 *
 * @param {string} source 真源码（盘上那一份，或历史提交里那一份 —— 刀用）
 * @param {Record<string, object>} stubs `require(name)` 的表
 * @returns {{ok:true, module:object, id:string|null} | {ok:false, reason:string}}
 */
function loadClientModule(source, stubs) {
  const captured = { spec: null }
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    document: {
      // 模块顶部那句"注入 <style>"靠它判重；返回一个非 null ⇒ 不碰 createElement。
      querySelector: () => ({ tagName: 'STYLE' }),
      body: { tagName: 'BODY' },
      addEventListener() {},
      removeEventListener() {},
    },
    window: {
      __ModuleLoader__: {
        load(spec) {
          captured.spec = spec
        },
      },
    },
  }
  try {
    vm.runInNewContext(source, sandbox, { filename: 'dash-client-harness:client.js', timeout: 10_000 })
  } catch (err) {
    return { ok: false, reason: `模块装载就抛了：${messageOf(err)}` }
  }
  if (captured.spec === null) return { ok: false, reason: '源码没有调用 `window.__ModuleLoader__.load(...)` —— 这不是那个浏览器包的形状' }
  if (typeof captured.spec.factory !== 'function') return { ok: false, reason: '`__ModuleLoader__.load` 的入参没有 `factory`' }
  let module
  try {
    module = captured.spec.factory((name) => {
      if (!(name in stubs)) throw new Error(`载具没有这个 stub 模块：${name}`)
      return stubs[name]
    })
  } catch (err) {
    return { ok: false, reason: `工厂抛了：${messageOf(err)}` }
  }
  if (typeof module?.apply !== 'function') return { ok: false, reason: '工厂没有导出 `apply(ctx)` —— 这不是那个插件体' }
  return { ok: true, module, id: captured.spec.id ?? null }
}

/** 走树：`pred(node)` 为真就收。 */
function findAll(node, pred, out = []) {
  if (node === null || node === undefined || node === false || node === true) return out
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, pred, out)
    return out
  }
  if (typeof node !== 'object') return out
  if (node.props !== undefined && pred(node)) out.push(node)
  findAll(node.props?.children, pred, out)
  return out
}

/** 树里的全部文字（按出现次序拼）。 */
export function textsOf(node, out = []) {
  if (node === null || node === undefined || node === false || node === true) return out
  if (Array.isArray(node)) {
    for (const child of node) textsOf(child, out)
    return out
  }
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (typeof node !== 'object') return out
  textsOf(node.props?.children, out)
  return out
}

/** 树里的第一个"对话框面板"（不认类名：`role="dialog"` 是面板自己的语义）。 */
export const findPanel = (tree) => findAll(tree, (node) => node.props?.role === 'dialog')[0] ?? null
/** 树里的第一个"工具栏按钮"（`aria-haspopup="dialog"`）。 */
export const findTrigger = (tree) => findAll(tree, (node) => node.props?.['aria-haspopup'] === 'dialog')[0] ?? null
/** 树里的第一个告警节点（`role="alert"`）。 */
export const findAlert = (tree) => findAll(tree, (node) => node.props?.role === 'alert')[0] ?? null
/** 那个槽位自己的根（`data-dashboard-action`）。 */
export const findRoot = (tree) => findAll(tree, (node) => node.props?.['data-dashboard-action'] === true)[0] ?? null
/**
 * 「这个工作区还没有快照」那条**状态**通知（`data-dashboard-absent`）。
 * 它与 `role="alert"` 是两个世界：一个是"这里本来就没有"，一个是"出事了" —— 判据必须分得开。
 */
export const findAbsent = (tree) => findAll(tree, (node) => node.props?.['data-dashboard-absent'] === true)[0] ?? null
/**
 * 树里所有 `role="status"` 节点（页脚「读数日 …」/ 读盘中 / 缺席通知都用它）。
 *
 * 为什么要元素级、不只扫全树文字：页脚是「读数日 <day> + 相对年龄」这条读数的**唯一载体**，
 * 拿 `texts` 里任意一条字符串去匹配，分不开"画在页脚"与"画在别处"（`cand-20261025-0363` 的同一条口径）。
 */
export const findStatusNodes = (tree) => findAll(tree, (node) => node.props?.role === 'status')

/**
 * 装一份渲染层，之后可以反复开"现场"。
 *
 * @param {string} source `client.js` 的全文
 */
export function createDashboardHarness(source) {
  const reactor = { current: null, active: null, position: null, lastHookArgs: null, hookCalls: 0 }
  const jsx = makeJsx(reactor)
  const stubs = {
    react: {
      useState: (initial) => reactor.active.useState(initial),
      useRef: (initial) => reactor.active.useRef(initial),
      useEffect: (fn, deps) => reactor.active.effect(fn, deps),
      useLayoutEffect: (fn, deps) => reactor.active.effect(fn, deps),
      createElement: (type, props, ...children) => jsx(type, {
        ...(props ?? {}),
        ...(children.length === 0 ? {} : { children: children.length === 1 ? children[0] : children }),
      }),
    },
    'react/jsx-runtime': {
      jsx,
      jsxs: jsx,
      Fragment: Symbol.for('react.fragment'),
    },
    'react-dom': { createPortal: (node) => node },
    '@deepseek-ai/dsh-client-ui-primitives': {
      StateDot: () => null,
      IconUsersOutlineRegular: () => null,
      IconChevronDownOutlineRegular: () => null,
      // 定位钩子：记下入参（"接的是谁的 ref"只能在这里看），返回现场指定的那个位置。
      useAnchoredPosition: (args) => {
        reactor.hookCalls += 1
        reactor.lastHookArgs = args ?? null
        return reactor.position
      },
    },
  }
  const loaded = loadClientModule(source, stubs)
  if (!loaded.ok) return { ok: false, reason: loaded.reason }

  /**
   * 一个现场：装一次插件（`apply(ctx)`）→ 点一次按钮 → 让读盘落定 → 再画一次。
   *
   * @param {{remote:unknown, sessionId?:string, position?:object|null, ticks?:number}} args
   */
  async function scene({ remote, sessionId = 'session-under-test', position = null, ticks = 3 } = {}) {
    const registered = { value: null }
    const ctx = {
      remote,
      logger: { warn() {}, info() {}, debug() {} },
      // 插件第一句是 `ctx.effect(() => ctx.locale.register(...), "…")`；字典不是这一格的判据。
      effect(fn) {
        const cleanup = fn()
        return cleanup
      },
      locale: { register: () => () => {} },
      slots: {
        inject(_name, factory) {
          registered.value = factory()
        },
        register(meta, Component) {
          return { meta, Component }
        },
      },
    }
    let applyThrew = null
    try {
      loaded.module.apply(ctx)
    } catch (err) {
      applyThrew = messageOf(err)
    }
    const registration = registered.value
    const actions = typeof registration?.meta?.inject === 'function' ? registration.meta.inject() : null
    const Component = registration?.Component ?? null
    const reading = {
      apply_threw: applyThrew,
      registered_slot: registration?.meta?.name ?? null,
      registered_id: registration?.meta?.id ?? null,
      has_component: typeof Component === 'function',
      has_read_snapshot: typeof actions?.readSnapshot === 'function',
      direct: null,
      click: null,
      settled: null,
      throws: [],
      trigger_present: false,
      root_present: false,
      alert_text: null,
      absent: null,
      /** 每个 `role="status"` 节点自己的文字（页脚 / 读盘中 / 缺席通知各一条）。 */
      status_texts: [],
      panel_style: null,
      hook_args: null,
      texts: [],
    }
    if (typeof Component !== 'function' || typeof actions?.readSnapshot !== 'function') {
      return reading
    }

    // ① 直接问一次那条读盘路径：**返回的是不是 promise / 抛不抛 / 结果或原因**。
    reading.direct = await probeCall(() => actions.readSnapshot(sessionId))

    const { renderer, log } = createRenderer(reactor)
    reactor.active = renderer
    reactor.position = position
    reactor.lastHookArgs = null
    reactor.hookCalls = 0
    const props = { sessionId, t: (key) => key, readSnapshot: actions.readSnapshot }

    // ② 点之前（open=false：面板不画，读盘 effect 也不跑）
    const before = renderer.render(Component, props)
    renderer.flush()
    const trigger = findTrigger(before.tree)
    if (trigger === null || typeof trigger.props.onClick !== 'function') {
      reading.click = { ok: false, why: '触发器（`aria-haspopup="dialog"`）不在，或者没有 `onClick` —— 点不了' }
      reading.hook_args = reactor.lastHookArgs
      reading.throws = log.threw
      return reading
    }
    // ③ 点一下：真调那个 `onClick`（`setOpen(!open)`）
    trigger.props.onClick()
    const opened = renderer.render(Component, props)
    const flushOpen = renderer.flush()
    reading.click = { ok: true, render_threw: opened.threw === null ? null : messageOf(opened.threw), effect_threw: flushOpen.threw === null ? null : messageOf(flushOpen.threw) }

    // ④ 让读盘那条 promise 落定（微任务 + 一个宏任务各给几拍）
    for (let i = 0; i < ticks; i += 1) await new Promise((resolve) => setImmediate(resolve))
    const settled = renderer.render(Component, props)
    renderer.flush()

    // ⚠️ 落定那一次**渲染抛了**才退回点开那一棵树；"组件自己返回 null"（槽位真的没了）
    //    不许被 `??` 吃掉 —— 那一条正是 `DASH11-CLIENT-BUTTON-GONE` 要读的事实。
    const tree = settled.threw === null ? settled.tree : opened.tree
    reading.settled = { render_threw: settled.threw === null ? null : messageOf(settled.threw) }
    reading.throws = log.threw.map((item) => `${item.where}: ${item.message}`)
    reading.trigger_present = findTrigger(tree) !== null
    reading.root_present = findRoot(tree) !== null
    const alert = findAlert(tree)
    reading.alert_text = alert === null ? null : textsOf(alert).join('').trim()
    // 每个 status 节点**各自**一段文字：页脚那条「读数日 …」与"读盘中 / 没有快照"是三个世界。
    reading.status_texts = findStatusNodes(tree).map((node) => textsOf(node).join('').trim())
    const absent = findAbsent(tree)
    reading.absent = absent === null ? null : {
      role: absent.props?.role ?? null,
      text: textsOf(absent).join('').trim(),
      /** `code` 子节点里的文字（口径写的是"一句人话 + `<code>path</code>`；这里只记读数，不断言）。 */
      code: findAll(absent, (node) => node.type === 'code').map((node) => textsOf(node).join('').trim()),
    }
    const panel = findPanel(tree)
    reading.panel_style = panel === null ? null : panel.props.style ?? null
    reading.hook_args = reactor.lastHookArgs === null ? null : {
      keys: Object.keys(reactor.lastHookArgs),
      open: reactor.lastHookArgs.open ?? null,
      gap: reactor.lastHookArgs.gap ?? null,
      margin: reactor.lastHookArgs.margin ?? null,
      anchor_is_trigger_ref: panel === null ? null : reactor.lastHookArgs.anchorRef === findTrigger(tree)?.props?.ref,
      panel_is_panel_ref: panel === null ? null : reactor.lastHookArgs.panelRef === panel.props.ref,
      anchor_defined: reactor.lastHookArgs.anchorRef !== undefined && reactor.lastHookArgs.anchorRef !== null,
      panel_defined: reactor.lastHookArgs.panelRef !== undefined && reactor.lastHookArgs.panelRef !== null,
    }
    reading.texts = textsOf(tree)
    reading.tree = tree
    return reading
  }

  return { ok: true, reason: null, module: loaded.module, id: loaded.id ?? null, scene }
}

/**
 * 把一个**表达式原文**求值成真值（只用于读源码里那个兜底对象字面量）。
 *
 * 为什么不用文本比对：`{visibility:"hidden",left:0,top:0}` 这类字面量的空白 / 引号种类 / 键序
 * 都可以变 —— 文本比对会把"同一个对象换了写法"判红，也会把"换了值但文本没变"判绿。
 * ⚠️ 求值的东西是**被测源码里的一段字面量**，不是外部输入；仍然给了 1 秒超时。
 *
 * @param {string} text 表达式原文（`{…}` / `[{…}]` / `"x"` 都行）
 * @returns {{ok:true, value:unknown, why:null} | {ok:false, value:null, why:string}}
 */
export function parseObjectLiteral(text) {
  try {
    return { ok: true, value: vm.runInNewContext(`(${text})`, {}, { timeout: 1000 }), why: null }
  } catch (err) {
    return { ok: false, value: null, why: messageOf(err) }
  }
}

/**
 * 调一次 `readSnapshot`：**同步抛**与**返回 rejected promise** 是两个不同的世界，
 * 这一格把它们分开记（前者会把 React 的槽位拆掉，后者只是画一条红条）。
 */
export async function probeCall(call) {
  let value
  try {
    value = call()
  } catch (err) {
    return { threw: true, thenable: false, status: 'threw-synchronously', message: messageOf(err) }
  }
  const thenable = value !== null && typeof value === 'object' && typeof value.then === 'function'
  if (!thenable) {
    return { threw: false, thenable: false, status: 'not-a-promise', value_type: typeof value, message: null }
  }
  try {
    const resolved = await value
    return { threw: false, thenable: true, status: 'resolved', value: resolved, message: null }
  } catch (err) {
    return { threw: false, thenable: true, status: 'rejected', value: null, message: messageOf(err) }
  }
}

/**
 * 取**某一版**渲染层的真字节（刀用）。
 *
 * 为什么要有它：合成变异体只能证明"判据会翻面"，证明不了"它抓得住那一版真正做过的事"。
 * 拿历史提交里那一版**真字节**装进载具跑一遍，抓到的才是那个行为本身。
 * `commit` 逐字给（`abc1234` 与 `abc1234^` 都行）；拿不到就如实说为什么，由调用方判 HOLD。
 *
 * @returns {{available:boolean, why:string|null, sha256:string|null, text:string|null}}
 */
export function clientSourceAtCommit({ repo = PATHS.repo, commit, rel = CLIENT_REL } = {}) {
  const empty = { available: false, why: null, sha256: null, text: null }
  if (typeof commit !== 'string' || commit.trim() === '') return { ...empty, why: '没给提交（`commit` 是空的）—— 取哪一版无从说起' }
  if (!existsSync(path.join(repo, '.git'))) return { ...empty, why: '这棵树没有 `.git`（只读副本 / 导出树）⇒ 拿不到历史字节' }
  const shown = spawnSync('git', ['show', `${commit}:${rel}`], { cwd: repo, encoding: 'utf8' })
  if (shown.status !== 0) return { ...empty, why: `git show ${commit}:${rel} 失败（exit ${shown.status}）：${String(shown.stderr ?? '').trim().slice(0, 200)}` }
  const text = String(shown.stdout ?? '')
  if (text.trim() === '') return { ...empty, why: `git show ${commit}:${rel} 拿到空正文` }
  return { available: true, why: null, sha256: createHash('sha256').update(text, 'utf8').digest('hex'), text }
}

/**
 * 取**故障那一版**的渲染层真字节（`d586215^:presets/agenia/client-ui-dashboard/lib/client.js`）。
 *
 * 两件事一起交回来：
 *   · `text` —— 拿去装进载具，证明"这两条新判据抓得住那一次真故障"；
 *   · `proves_old` —— 那一版**自己**的指纹（`visibility: "hidden"` 在、兜底那句报错文案不在）。
 *     第 ① 条不成立就说明这个哈希指错了版，那时刀证明的是别的东西 ⇒ 调用方必须 `HOLD`，不许当绿。
 *
 * @returns {{available:boolean, why:string|null, sha256:string|null, text:string|null,
 *            has_hidden_fallback:boolean, has_guard_message:boolean, proves_old:boolean}}
 */
export function preFailureClientSource({ repo = PATHS.repo, commit = PRE_FAILURE_COMMIT } = {}) {
  const empty = { available: false, why: null, sha256: null, text: null, has_hidden_fallback: false, has_guard_message: false, proves_old: false }
  const at = clientSourceAtCommit({ repo, commit: `${commit}^` })
  if (!at.available) return { ...empty, why: at.why }
  const text = at.text
  const hasHidden = /visibility\s*:\s*["']hidden["']/.test(text)
  const hasGuard = text.includes('remote.workspaceFiles 不可用')
  return {
    available: true,
    why: null,
    sha256: at.sha256,
    text,
    has_hidden_fallback: hasHidden,
    has_guard_message: hasGuard,
    proves_old: hasHidden && !hasGuard,
  }
}
