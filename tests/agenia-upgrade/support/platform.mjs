/**
 * **这一跑是在哪个平台版本上跑的** —— 一个**读数**，不是判据（它不改退出码，也不进分母）。
 *
 * 病根（`F-106` 里那句）：整棵 `tests/` 没有一条在读平台版本 ⇒ 平台若把
 * `run_in_background` 那个参数还回来，人重新被卡住，而门禁判据**一片绿** ——
 * 因为"绿的是**哪一版**平台上绿的"这件事**没有任何落点**。
 *
 * ── 读的是什么 ────────────────────────────────────────────────────────────
 *   · **桌面 App**：`app.asar!package.json` 的 `name@version` —— 它决定这一版平台里
 *     有没有 `tools.guard`、`run_in_background`、`delegationTools` 这些**平台事实**；
 *   · **平台包**：`app.asar!dsh/node_modules/@deepseek-ai/dsh/package.json` —— 与上面那份并列。
 *     两份**同版**时只印一个数；**不同版**本身就是一条要人看的读数（升级到一半的样子）。
 *
 * ⚠️ 这两样都**不是**它：
 *   · `AGENIA_ORACLE_VERSION`（`run-all.mjs` 的 ENV）—— 那是冻结的 **0.2.0 桌面 oracle**，
 *     是"被测期望值"的来历，不是"现在跑在哪个平台"；
 *   · `resources/runtime/versions.json` —— 那是随包捆绑的 node / pnpm 版本；
 *   · `tests/.../support/env.mjs` 里那些 `0.2.1` 注释 —— 散文，不是读数。
 *
 * ── 怎么找到那份 asar（四级，先到先算）────────────────────────────────────
 *   ① `AGENIA_PLATFORM_ASAR` —— 直接给 asar 文件；
 *   ② `AGENIA_PLATFORM_ROOT` —— 给安装根 ⇒ `<root>/resources/app.asar`；
 *   ③ **扫环境变量**：值里出现 `…\resources\app.asar` 的那一条（这台机器上 `VIPSHOME`
 *      就带着这条路 —— 平台自己设的）⇒ 从那条路推回去；
 *   ④ **本机落点 `E:\HarnessCLI\resources\app.asar` —— 硬编码的绝对路径**（兜底）。
 *
 * 🔴 **①②③ 不写死盘符；④ 写死。** 说清楚，因为第 4 关点过这一句（`R-3`）：
 *    ④ 只在"前三级全不中"时才会被用到，**且它一旦被用上，输出里会明写
 *    `asar 取自 本机兜底（硬编码）`** —— 读的人看得见"这一跑的答案是猜的"。
 *    换机器靠 ①②③；④ 在这台机器之外大概率不在盘，那就走"判不了"。
 *
 * 🔴 **真实的失效面不是"判不了"，是"判了另一份"**（第 4 关 §3.3）：
 *    第 ③ 级扫全部环境变量、取第一条**值里含 `app.asar`** 的，而环境块的枚举次序
 *    **代码里没有任何东西保证先到的那条是对的**；换一台机器，若某条变量提到的是
 *    另一份（旧的 / 别的 Electron 应用的）`resources/app.asar` 且恰好在盘，
 *    就会 `ok:true` 并印一个**很可信但错的**版本。
 *    ⇒ 解药：**核应用名** —— `ok` 要求 `name === '@deepseek-ai/dsh-desktop'`（`R-9`），
 *      不符就记 problem、判 `ok:false`：不许"读到了就算数"。
 *
 * 读不出来 ⇒ `ok:false` + `problems`。**不许静默**：`run-all` 会印一行 `[平台] 🔴 判不了`，
 * 结算里也留一条 —— "判不了"是一个**要人处理**的读数，不是"没有这回事"。
 */
import { closeSync, existsSync, openSync, readFileSync, readSync } from 'node:fs'
import path from 'node:path'

/** 桌面客户端那份 package.json 里的 `name` —— 核"这一份 asar 到底是不是它"（`R-9`）。 */
const DESKTOP_APP = '@deepseek-ai/dsh-desktop'
/** 第 ④ 级：本机落点（**硬编码兜底**，前三级命中时它不会被动到；换机器靠 ①②③）。 */
const FALLBACK_ASAR = 'E:\\HarnessCLI\\resources\\app.asar'
/** asar 里那两份 package.json（`dsh/` 下那个包才是平台本体）。 */
const APP_PKG = 'package.json'
const DSH_PKG = 'dsh/node_modules/@deepseek-ai/dsh/package.json'

/** `\\?\E:\…` ⇒ `E:\…`（`VIPSHOME` 这类值带 Windows 长路径前缀）。 */
const stripLongPrefix = (p) => String(p).replace(/^\\\\\?\\/, '')

/**
 * 从环境变量的**值**里认出安装根 —— 只要值里出现 `<root>\resources\app.asar`。
 * 为什么这么做而不是写死盘符：设这个变量的是**平台自己**，换机器 / 换安装位置它跟着变。
 */
function asarFromEnvValues(env) {
  const hits = []
  for (const [key, raw] of Object.entries(env)) {
    if (typeof raw !== 'string') continue
    const value = stripLongPrefix(raw)
    const at = value.toLowerCase().indexOf('app.asar')
    if (at < 0) continue
    hits.push({ key, asar: `${value.slice(0, at)}app.asar` })
  }
  return hits
}

/** 读一次 asar 的目录头（一次进程里只读一次 —— 这份头有大几 MB）。 */
const headerCache = new Map()
function asarHeader(asar) {
  if (headerCache.has(asar)) return headerCache.get(asar)
  const entry = { header: null, dataOffset: 0, problem: null }
  let fd
  try {
    fd = openSync(asar, 'r')
    const head = Buffer.alloc(16)
    readSync(fd, head, 0, 16, 0)
    const headerSize = head.readUInt32LE(12)
    const buf = Buffer.alloc(headerSize)
    readSync(fd, buf, 0, headerSize, 16)
    entry.header = JSON.parse(buf.toString('utf8'))
    entry.dataOffset = 16 + headerSize
  } catch (e) {
    entry.problem = `读 asar 目录头失败：${e.code ?? e.message}`
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
  headerCache.set(asar, entry)
  return entry
}

/** 从 asar 里取一份文件的内容（按 asar 目录树走；`unpacked` 的真身在旁边的目录里）。 */
function readAsarFile(asar, inner) {
  const { header, dataOffset, problem } = asarHeader(asar)
  if (header === null) return { text: null, problem }
  let node = header
  for (const part of inner.split('/').filter(Boolean)) {
    node = node?.files?.[part]
    if (node === undefined) return { text: null, problem: `asar 里没有 ${inner}` }
  }
  if (node.files !== undefined) return { text: null, problem: `${inner} 在 asar 里是个目录` }
  if (node.unpacked === true) {
    const unpacked = `${asar}.unpacked\\${inner.split('/').join('\\')}`
    if (!existsSync(unpacked)) return { text: null, problem: `unpacked 真身不在盘上：${unpacked}` }
    try {
      return { text: readFileSync(unpacked, 'utf8'), problem: null }
    } catch (e) {
      return { text: null, problem: `读 unpacked 真身失败：${e.code ?? e.message}` }
    }
  }
  let fd
  try {
    fd = openSync(asar, 'r')
    const size = Number(node.size ?? 0)
    const buf = Buffer.alloc(size)
    if (size > 0) readSync(fd, buf, 0, size, dataOffset + Number(node.offset ?? 0))
    return { text: buf.toString('utf8'), problem: null }
  } catch (e) {
    return { text: null, problem: `读 ${inner} 失败：${e.code ?? e.message}` }
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

/** 那份 package.json 的 `name@version`（读不出来 ⇒ null + 一条原因）。 */
function nameVersionOf(asar, inner) {
  const { text, problem } = readAsarFile(asar, inner)
  if (text === null) return { name: null, version: null, problem }
  try {
    const pkg = JSON.parse(text)
    if (typeof pkg.version !== 'string' || pkg.version === '') {
      return { name: pkg.name ?? null, version: null, problem: `${inner} 里没有 version` }
    }
    return { name: pkg.name ?? null, version: pkg.version, problem: null }
  } catch (e) {
    return { name: null, version: null, problem: `${inner} 不是合法 JSON：${e.message}` }
  }
}

/**
 * 这一跑的平台读数。
 *
 * @param {object} [opts]
 * @param {Record<string,string|undefined>} [opts.env] 环境（默认 `process.env`；自检时喂假的）
 * @param {string|null} [opts.fallbackAsar] 第 ④ 级那个"本机落点"。
 *   **传 `null` = 禁用第 ④ 级** —— 这是让**"判不了"那一支能真跑出来**的唯一办法
 *   （这台机器上第 ④ 级永远在盘 ⇒ 不禁用它，`ok:false` 实际不可达；第 4 关 `R-7`）。
 * @returns {{
 *   ok: boolean,
 *   app: {name: string|null, version: string|null, problem: string|null}|null,
 *   dsh: {name: string|null, version: string|null, problem: string|null}|null,
 *   asar: string|null,
 *   source: string|null,
 *   level: number|null,
 *   hardcoded_fallback: boolean,
 *   tried: string[],
 *   problems: string[],
 * }}
 */
export function platformReading({ env = process.env, fallbackAsar = FALLBACK_ASAR } = {}) {
  const problems = []
  /** 四级**逐级**记一条（**永远 4 条**）—— 判不了时"试过哪些地方"才是可读的。 */
  const tried = []
  /** 候选：`{level, source, asar}` —— 先到先算。 */
  const candidates = []
  const mark = (asar) => (existsSync(asar) ? '在盘' : '不在盘')

  // ① 显式 asar
  const explicitAsar = env.AGENIA_PLATFORM_ASAR
  if (typeof explicitAsar === 'string' && explicitAsar !== '') {
    const asar = path.resolve(stripLongPrefix(explicitAsar))
    tried.push(`① AGENIA_PLATFORM_ASAR → ${asar}（${mark(asar)}）`)
    candidates.push({ level: 1, source: 'AGENIA_PLATFORM_ASAR（显式给的）', asar })
  } else {
    tried.push('① AGENIA_PLATFORM_ASAR：没设')
  }

  // ② 安装根
  const root = env.AGENIA_PLATFORM_ROOT
  if (typeof root === 'string' && root !== '') {
    const asar = path.resolve(stripLongPrefix(root), 'resources', 'app.asar')
    tried.push(`② AGENIA_PLATFORM_ROOT → ${asar}（${mark(asar)}）`)
    candidates.push({ level: 2, source: 'AGENIA_PLATFORM_ROOT（显式给的）', asar })
  } else {
    tried.push('② AGENIA_PLATFORM_ROOT：没设')
  }

  // ③ 扫环境变量的值（跳过 ①② 自己用的那两个键 —— 它们已经在上面记过了）
  const hits = asarFromEnvValues(env).filter((h) => h.key !== 'AGENIA_PLATFORM_ASAR' && h.key !== 'AGENIA_PLATFORM_ROOT')
  if (hits.length === 0) {
    tried.push('③ 环境变量里含 `…\\resources\\app.asar` 的值：一条都没有')
  } else {
    tried.push(`③ 环境变量里含 app.asar 的值 ${hits.length} 条：${hits.map((h) => `${h.key} → ${h.asar}`).join(' · ')}`)
    for (const h of hits) candidates.push({ level: 3, source: `环境变量 ${h.key}`, asar: h.asar })
  }

  // ④ 本机落点（硬编码兜底；`fallbackAsar === null` ⇒ 这一级禁用）
  if (fallbackAsar === null || fallbackAsar === undefined) {
    tried.push('④ 本机兜底：这一跑**禁用了**（`fallbackAsar = null`）')
  } else {
    const asar = path.resolve(String(fallbackAsar))
    tried.push(`④ 本机兜底（硬编码）→ ${asar}（${mark(asar)}）`)
    candidates.push({ level: 4, source: '本机兜底（硬编码）', asar })
  }

  // 同一个 asar 被两条路指到 ⇒ 只留先到的那条（否则 `tried` 里重复，读的人以为试过两处）。
  const seen = new Set()
  const unique = candidates.filter((c) => {
    const key = String(c.asar).toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const picked = unique.find((c) => existsSync(c.asar)) ?? null
  if (picked === null) {
    problems.push('没找到 app.asar（四级候选全不在盘）—— 这一跑"跑在哪个平台版本上"**没有落点**')
    return {
      ok: false, app: null, dsh: null, asar: null, source: null,
      level: null, hardcoded_fallback: false, tried, problems,
    }
  }

  const app = nameVersionOf(picked.asar, APP_PKG)
  const dsh = nameVersionOf(picked.asar, DSH_PKG)
  if (app.problem !== null) problems.push(`桌面 App 版本读不出来：${app.problem}`)
  if (dsh.problem !== null) problems.push(`平台包版本读不出来：${dsh.problem}`)
  /**
   * 🔴 `ok` **不只**看"有没有版本号"（`R-9`）：第 ③/④ 级可能指到**别的 Electron 应用**的
   *    `resources/app.asar`，那种地方**也有** `package.json` + `version` ⇒ 只看 version 会
   *    印一个"很可信但错"的版本。应用名不对 ⇒ 记 problem、判 `ok:false`。
   */
  const nameOk = app.name === DESKTOP_APP
  if (!nameOk && app.name !== null) {
    problems.push(`这份 asar 里的应用不是桌面客户端（name=${JSON.stringify(app.name)} ≠ ${JSON.stringify(DESKTOP_APP)}）`
      + ' —— 第 ③/④ 级可能指到了别的 Electron 应用；这一跑的平台版本**不认**')
  }
  const ok = nameOk && typeof app.version === 'string'
  if (!ok && problems.length === 0) problems.push('读到 asar 了，但里面没有可用的版本号')
  return {
    ok, app, dsh,
    asar: picked.asar,
    source: picked.source,
    level: picked.level,
    hardcoded_fallback: picked.level === 4,
    tried, problems,
  }
}

/**
 * 一行读数 —— 形状钉死，方便有人拿 `grep '^\[平台\]'` 捞。
 *
 *   `[平台] 0.2.1-rc.2（@deepseek-ai/dsh-desktop + @deepseek-ai/dsh 同版）· asar 取自 环境变量 VIPSHOME`
 *   `[平台] 桌面 0.2.1-rc.2 / 平台包 0.2.2 —— 🔴 两者不同版`（装到一半的样子）
 *   `[平台] 🔴 判不了：…（试过 ① … · ② … · ③ … · ④ …）`
 *
 * ⚠️ 第 ④ 级命中时，那一行会写 `asar 取自 本机兜底（硬编码）` —— "这一跑的答案是猜的"必须看得见。
 */
export function platformLine(reading) {
  if (!reading.ok) {
    return `[平台] 🔴 判不了：${reading.problems.join('；')}`
      + `（试过 ${reading.tried.join(' · ')}）`
  }
  const appV = reading.app?.version ?? '(缺)'
  const dshV = reading.dsh?.version ?? '(缺)'
  const who = [reading.app?.name, reading.dsh?.name].filter((n) => typeof n === 'string')
  const tail = `· asar 取自 ${reading.source}`
  if (dshV === '(缺)') {
    return `[平台] ${appV}（${who.join(' + ') || '包名缺'}；平台包**读不出来**）${tail}`
  }
  if (appV !== dshV) {
    return `[平台] 桌面 ${appV} / 平台包 ${dshV} —— 🔴 **两者不同版**（装到一半的样子）${tail}`
  }
  return `[平台] ${appV}（${who.join(' + ')} 同版）${tail}`
}
