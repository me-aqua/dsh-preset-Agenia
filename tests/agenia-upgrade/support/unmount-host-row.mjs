/**
 * `unmount-host-row.mjs` 的判据夹具与尺子（`UMH-01`…`UMH-05` 共用）。
 *
 * 契约：`.team/test/2026-11-10/CONTRACT-gate2-unmount-host-row.md`（唯一出处；本文件只实现它，不追加口径）。
 *
 * ## 这个模块回答的三件事
 *   ① **副本**：把工具的**运行集**逐字节复制进运行根，工具一律用 `--repo <copy>` 跑。运行集是
 *      「工具 + 它 import 的 `presets/agenia/lib/atomic.mjs` + 生成器 + 组合 + 补丁」这五份。
 *      🔴 `presets/agenia/lib/atomic.mjs` 是运行集的**必需件**，不是"顺手多带一份"：工具写盘走那份
 *      `writeFileAtomic(file, data) → {ok, code}`（临时件 → fsync → rename），第二套同样的三步是自造轮子。
 *      副本的目录结构就是产品的目录结构 ⇒ 少这一份，副本里的工具**加载即**失败
 *      （`ERR_MODULE_NOT_FOUND` · exit 1 · 零 stdout），五格会红在**与产品无关**的一件事上。
 *      所以它和另外三份一样是 `copyFixture()` 的**必需**输入：源树里没有 ⇒ 当场拒（`副本缺源文件`），
 *      不许安静地造一棵"工具跑不起来"的副本。守它的是 `UMH-01` 的 `copy-runnable-set` 腿 + 刀 K8。
 *      副本里**没有 `.git`** ⇒ 任何"往上爬找仓库 / 用 git 定位"的实现会写到**活树**；`liveSentinel()` 抓它。
 *   ② **尺子**：落点只有一个口径 —— `client-ui-placement.mjs::describePlacement()`（`DASH-15`/`DASH-16` 的判据本体）。
 *      本模块**不另造解析器**：`rowLanding()` 只是把它的 `rows` 数一下。
 *   ③ **四种入口态 + 三种生成器 + 刀**：`M` / `B` / `C` / `U` 的文本构造、见证生成器、失败注入 stub、
 *      七把刀的假工具，外加一把"把真工具改坏一行"的变体（`staleBlindTool`，刀 K9）。
 *
 * ## 两条边界（写下来，别当假设）
 *   · **不钉 `HOST_LEVEL_IDS` 的形状**：`carrierFacts().listed` 只用于**夹具自检**与诊断读数，
 *     **没有任何判据**依赖它（契约 §六.2：判据只看"生成器文件被改过"与"生成器行为/落点"）。
 *   · **假工具是故意错的**：它们是判据自己的刀（"这一格该红时会红"），不是实现的参考稿 ——
 *     每一个都缺一件必需的事（写盘 / 派生 / 拒绝 / 回滚 / 幂等），别照着抄。
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describePlacement } from './client-ui-placement.mjs'
import { PATHS } from './env.mjs'
import { problem, runRoot } from './evidence.mjs'

/** 契约 §六.3：判据只钉这一个行 id（今天 `HOST_LEVEL_IDS` 与组合里都只有它）。 */
export const ROW_ID = 'agenia-dashboard'

/**
 * 工具对「载体翻过了、补丁没跟着翻」的那个码（被测命令自己的名字）。
 * 判据只认这一个名字：一句不说清是哪件事的失败，读的人分不出"入口态不对"与"树被中断过"。
 */
export const STALE_CODE = 'E_UNMOUNT_PATCH_STALE'

/** 工具的**运行集** + 被写的那一份补丁，相对 `<repo>` 的路径。 */
export const REL = Object.freeze({
  tool: '.tools/unmount-host-row.mjs',
  atomic: 'presets/agenia/lib/atomic.mjs',
  generator: '.tools/make-bundle-patch.mjs',
  composition: 'presets/agenia/agent.cordis.yml',
  patch: 'presets/agenia/cordis.patch.yml',
})

/**
 * `copyFixture()` 的**必需**件（`REL` 的键）：少一份，副本里那条命令就跑不起来 ⇒ 这一格判不了。
 * 工具自己（`tool`）不在盘上时是**另行处理**的（`UMH-TOOL-ABSENT`），所以它不在这张表里。
 */
const RUNNABLE = Object.freeze(['atomic', 'generator', 'composition', 'patch'])

/** 工具必须打的那一行标记（组合里 `- id: <id>` 的下一行、两格缩进）。 */
const MARK_LINE = /^ {2}#\s*@host-level\b/
const MARK_ANY = /@host-level\b/

const sha256OfBytes = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase()
const sha256OfFile = (file) => sha256OfBytes(readFileSync(file))

// ── 文本：一行块 / 三个载体 ────────────────────────────────────────────────
/**
 * 顶格行块（与生成器 `splitRows()` 同口径：只认行首的 `- `）。
 * @returns {{start:number,end:number,lines:string[]}|null}  `start` 是 `- id:` 那一行（0 基），`end` 是**不含**
 */
export function rowBlock(text, id = ROW_ID) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n')
  const start = lines.findIndex((line) => line.trim() === `- id: ${id}`)
  if (start < 0) return null
  let end = start + 1
  while (end < lines.length && !/^- /.test(lines[end])) end += 1
  return { start, end, lines }
}

/**
 * 三个载体的在/不在。`marker` / `disabled` 读的是**组合行块**（契约 §一.2 的 A / C），
 * `listed` 读的是生成器文本里的 `HOST_LEVEL_IDS` —— **只用于夹具自检与诊断，不进任何判据**（契约 §六.2）。
 *
 * @returns {{marker:boolean, disabled:boolean, listed:boolean|null, listed_parse:string, row_found:boolean}}
 */
export function carrierFacts({ compositionText, generatorText, id = ROW_ID }) {
  const block = rowBlock(compositionText, id)
  const marker = block === null ? false : block.lines.slice(block.start, block.end).some((line) => MARK_LINE.test(line))
  const disabled = block === null
    ? false
    : block.lines.slice(block.start, block.end).some((line) => /^ {2}disabled:\s*true\s*$/.test(line))
  const list = listedReadout(generatorText, id)
  return { marker, disabled, listed: list.listed, listed_parse: list.how, row_found: block !== null }
}

/** `HOST_LEVEL_IDS` 里有没有这个 id —— **诊断读数**（形状不钉，读不出来就说读不出来）。 */
function listedReadout(generatorText, id) {
  const hit = /HOST_LEVEL_IDS\s*=\s*[^[]*\[([\s\S]*?)\]/.exec(String(generatorText))
  if (hit === null) return { listed: null, how: 'unparsed' }
  const items = hit[1].split(',').map((s) => s.trim().replace(/^['"`]|['"`]$/g, '')).filter((s) => s !== '')
  return { listed: items.includes(id), how: 'literal' }
}

/** 删掉行块里的 `# @host-level` 行（**只删这一行**；其余字节不动）。 */
export function dropMarkerText(text, id = ROW_ID) {
  const block = rowBlock(text, id)
  if (block === null) throw new Error(`夹具造不出来：组合里没有 \`- id: ${id}\``)
  const out = block.lines.filter((line, i) => !(i >= block.start && i < block.end && MARK_ANY.test(line)))
  return out.join('\n')
}

/** 在行块**末尾**加一行 `  disabled: true`（契约 §一.2 的 C；位置不钉，这里取最小 diff 的末尾）。 */
export function addDisabledText(text, id = ROW_ID) {
  const block = rowBlock(text, id)
  if (block === null) throw new Error(`夹具造不出来：组合里没有 \`- id: ${id}\``)
  const out = [...block.lines]
  out.splice(block.end, 0, '  disabled: true')
  return out.join('\n')
}

/** 把 id 从 `HOST_LEVEL_IDS` 的字面量里拿掉（**夹具**用；判据从不读这个形状）。 */
export function dropListedText(generatorText, id = ROW_ID) {
  const re = /(HOST_LEVEL_IDS\s*=\s*[^[]*\[)([\s\S]*?)(\])/
  const hit = re.exec(String(generatorText))
  if (hit === null) throw new Error('夹具造不出来：生成器里找不到 `HOST_LEVEL_IDS = …[…]`')
  const items = hit[2].split(',').map((s) => s.trim()).filter((s) => s !== '')
    .filter((s) => s.replace(/^['"`]|['"`]$/g, '') !== id)
  return String(generatorText).replace(re, (_m, open, _body, close) => `${open}${items.join(', ')}${close}`)
}

// ── 尺子：落点 ────────────────────────────────────────────────────────────
/**
 * 契约 §4.3 的**唯一**口径：`insert` / `preset_bodies` 各几条。
 * 用的是 `describePlacement()`（YAML 子树判位置，不数缩进）。
 *
 * @returns {{insert:number, preset_bodies:number, total:number, rows:object[]}}
 */
export function rowLanding(patchText, id = ROW_ID) {
  const { rows } = describePlacement(String(patchText), '待判补丁')
  const mine = rows.filter((row) => row.id === id)
  return {
    insert: mine.filter((row) => row.placement === 'insert').length,
    preset_bodies: mine.filter((row) => row.in_preset_body === true).length,
    total: mine.length,
    rows: mine.map((row) => ({ placement: row.placement, in_preset_body: row.in_preset_body, preset: row.preset, disabled: row.disabled })),
  }
}

// ── 副本 / 快照 / 哨兵 ────────────────────────────────────────────────────
/** 这一跑专用的 scratch 目录（**只在运行根里**；C 盘一个字节都不写）。 */
export function scratchDir(name) {
  const base = path.join(runRoot(), 'tmp', 'umh')
  mkdirSync(base, { recursive: true })
  const safe = String(name).replace(/[^A-Za-z0-9._-]/g, '-')
  // 🔴 用 mkdtempSync 拿一个**唯一**目录，**不删旧目录**：`ENV-02` 的 `DELETE-NO-MARKER` 要求每次删除前
  //    先校验 marker 与落点；夹具这里干脆不删 —— 它只在自己这一跑的新目录里干活。
  return mkdtempSync(path.join(base, `${safe}-`))
}

/** 产品那几份的绝对路径（`RUNNABLE` + 工具）。 */
export const SOURCE = Object.freeze({
  repo: PATHS.repo,
  tool: path.join(PATHS.repo, REL.tool),
  atomic: path.join(PATHS.repo, REL.atomic),
  generator: PATHS.generator,
  composition: PATHS.liveComposition,
  patch: PATHS.livePatch,
})

export function toolExists(repo = PATHS.repo) {
  return existsSync(path.join(repo, REL.tool))
}

/**
 * 把工具的**运行集**（`RUNNABLE`：原子写 / 生成器 / 组合 / 补丁）逐字节复制进 `dest`，工具在盘上时连它一起。
 * **副本里没有 `.git`**。
 *
 * 🔴 `RUNNABLE` 的每一份都是**必需**的：副本的目录结构就是产品的目录结构，少一份 ⇒ 副本里那条命令
 * 加载即失败（`ERR_MODULE_NOT_FOUND` 之类）⇒ 五格红在一个与产品无关的事上。所以缺了**当场拒**，
 * 不安静地造一棵跑不起来的副本（理由逐条写在文件头 ①）。
 *
 * @returns {{dest:string, tool_present:boolean, source:object}}
 */
export function copyFixture(dest, { repo = PATHS.repo } = {}) {
  // 🔴 不删：`dest` 由 `scratchDir()` 给，永远是新目录；已经有了 = 夹具坏了（宁可红，不许删别人的东西）
  if (existsSync(dest) && readdirSync(dest).length > 0) {
    throw new Error(`夹具坏了：${dest} 不是新目录（copyFixture 不删旧目录）`)
  }
  const src = {}
  for (const key of [...RUNNABLE, 'tool']) src[key] = path.join(repo, REL[key])
  for (const key of RUNNABLE) {
    if (!existsSync(src[key])) {
      throw new Error(`副本缺源文件：${src[key]}（产品树不完整 ⇒ 这一格判不了）`
        + `—— 这一份属于工具的运行集（${RUNNABLE.map((k) => REL[k]).join(' · ')}），不是可选附件`)
    }
    const to = path.join(dest, REL[key])
    mkdirSync(path.dirname(to), { recursive: true })
    cpSync(src[key], to)
  }
  const toolPresent = existsSync(src.tool)
  if (toolPresent) {
    const to = path.join(dest, REL.tool)
    mkdirSync(path.dirname(to), { recursive: true })
    cpSync(src.tool, to)
  }
  return { dest, tool_present: toolPresent, source: src }
}

/** 一棵树的快照（相对路径 → 字节数 + sha256）。用来判"文件集合"与"逐字节"两件事。 */
export function snapshotTree(dir) {
  const out = []
  const walk = (sub) => {
    const abs = sub === '' ? dir : path.join(dir, sub)
    if (!existsSync(abs)) return
    for (const name of readdirSync(abs).sort()) {
      const rel = sub === '' ? name : `${sub}/${name}`
      const full = path.join(dir, rel)
      if (statSync(full).isDirectory()) walk(rel)
      else out.push({ rel: rel.replace(/\\/g, '/'), bytes: statSync(full).size, sha256: sha256OfFile(full) })
    }
  }
  walk('')
  return out.sort((a, b) => a.rel.localeCompare(b.rel))
}

/**
 * 活树哨兵：工具的**运行集** + 补丁 + 工具（存在才算）—— 跑之前 / 跑之后各量一次。
 * 原子写那一份也在里面：它是副本运行集的一员，工具在活树上往它旁边写临时件同样是"写到活树"。
 */
export function liveSentinel({ repo = PATHS.repo } = {}) {
  const files = {}
  for (const rel of [REL.atomic, REL.generator, REL.composition, REL.patch, REL.tool]) {
    const abs = path.join(repo, rel)
    files[rel] = existsSync(abs) ? sha256OfFile(abs) : null
  }
  return files
}

/** 两份哨兵读数里**变了 / 多了 / 少了**的键。 */
export function sentinelDiff(before, after) {
  const out = []
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[key] !== after[key]) out.push({ rel: key, before: before[key] ?? null, after: after[key] ?? null })
  }
  return out
}

// ── 跑：工具 / 生成器 ─────────────────────────────────────────────────────
/** 跑一个 node 脚本（stdout/stderr 全收；不设 shell）。 */
export function spawnNode(script, args = [], { cwd = path.dirname(script), env = process.env } = {}) {
  const r = spawnSync(process.execPath, [script, ...args], {
    cwd,
    env,
    encoding: 'utf8',
    timeout: 180000,
    maxBuffer: 64 * 1024 * 1024,
  })
  return { status: r.status, signal: r.signal, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error ? String(r.error.message ?? r.error) : null }
}

/**
 * 从 stdout 里读那一行 JSON（契约 §四.1）。**最后一行**是 JSON 才算；读不出来就把原因带回去。
 * @returns {{ok:boolean, value:object|null, error:string|null, json_lines:number, lines:string[]}}
 */
export function parseToolJson(stdout) {
  const lines = String(stdout).split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '')
  const jsonLines = lines.filter((l) => l.startsWith('{') && l.endsWith('}'))
  if (jsonLines.length === 0) return { ok: false, value: null, error: 'stdout 里没有一行 JSON', json_lines: 0, lines }
  try {
    const value = JSON.parse(jsonLines[jsonLines.length - 1])
    return { ok: true, value, error: null, json_lines: jsonLines.length, lines }
  } catch (err) {
    return { ok: false, value: null, error: `最后一行不是合法 JSON：${String(err?.message ?? err)}`, json_lines: jsonLines.length, lines }
  }
}

/** 工具的一句读数（`--repo` 指到副本；cwd 也设在副本里 —— 两种都必须成立）。 */
export function runTool(copy, { action = 'apply', id = ROW_ID, extraArgs = [] } = {}) {
  const script = path.join(copy, REL.tool)
  const args = ['--repo', copy, '--id', id, `--${action}`, ...extraArgs]
  const run = spawnNode(script, args, { cwd: copy })
  const parsed = parseToolJson(run.stdout)
  return { ...run, args, json: parsed.value, json_error: parsed.error, json_lines: parsed.json_lines, stdout_lines: parsed.lines }
}

/** `make-bundle-patch.mjs --check`（补丁是不是**派生物**：不是就非零）。 */
export function runGeneratorCheck(copy) {
  return spawnNode(path.join(copy, REL.generator), ['--check'], { cwd: copy })
}

/** 读副本当前的三份文本 + 载体读数 + 落点。 */
export function readFixture(copy) {
  const compositionText = readFileSync(path.join(copy, REL.composition), 'utf8')
  const generatorText = readFileSync(path.join(copy, REL.generator), 'utf8')
  const patchText = existsSync(path.join(copy, REL.patch)) ? readFileSync(path.join(copy, REL.patch), 'utf8') : ''
  return {
    compositionText,
    generatorText,
    patchText,
    carriers: carrierFacts({ compositionText, generatorText }),
    landing: patchText === '' ? null : rowLanding(patchText),
  }
}

// ── 入口态（契约 §二）─────────────────────────────────────────────────────
/**
 * 造入口态。`M` 原样；`B` 只删标记；`C` 只删名单；`U` 三处都改成撤下态。
 * @returns {{compositionText:string, generatorText:string, want_carriers:object}}
 */
export function preState(state, { compositionText, generatorText }) {
  const edit = (c, g) => ({ compositionText: c, generatorText: g })
  switch (state) {
    case 'M':
      return { ...edit(compositionText, generatorText), want_carriers: { marker: true, disabled: false, listed: true } }
    case 'B':
      return { ...edit(dropMarkerText(compositionText), generatorText), want_carriers: { marker: false, disabled: false, listed: true } }
    case 'C':
      return { ...edit(compositionText, dropListedText(generatorText)), want_carriers: { marker: true, disabled: false, listed: false } }
    case 'U':
      return {
        ...edit(addDisabledText(dropMarkerText(compositionText)), dropListedText(generatorText)),
        want_carriers: { marker: false, disabled: true, listed: false },
      }
    default:
      throw new Error(`没有这种入口态：${state}`)
  }
}

// ── 生成器：真 / 见证 / 失败 stub ─────────────────────────────────────────
/**
 * **见证生成器** = 一段抬头 + 真生成器的正文。
 *
 * 抬头做的事：把"我被调用时，组合里那两格载体是什么 / 生成器自己那份文件的 sha256 / cwd 是什么"
 * 写进 `outFile`（**副本外面**，免得它自己把副本的文件集合弄脏），然后 `exit 1`。
 *
 * 为什么抬头要**包着真正文**而不是替换掉：工具要能从这份文件里读到 `HOST_LEVEL_IDS`（契约 §一.2 的 B），
 * 替换掉它 = 把被测入口态弄坏，那一格就变成"夹具坏了"。
 * ⚠️ 这条夹具假设工具**定点修改**生成器（只动名单那一处）。若工具整份重写生成器，抬头会被抹掉 ⇒
 *    生成器不会失败 ⇒ 那一格报 `UMH-INJECTION-NOT-REACHED`（红），**不会**假绿。
 */
export function witnessGenerator(realText, outFile) {
  const out = String(outFile).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  const header = [
    '// ── 见证抬头（`UMH-05` / `UMH-02` / `UMH-03` 的夹具；不是产品代码）────────────────',
    "import { createHash as __xSha } from 'node:crypto'",
    "import { readFileSync as __xRead, writeFileSync as __xWrite } from 'node:fs'",
    "import { dirname as __xDir, join as __xJoin, resolve as __xResolve } from 'node:path'",
    "import { fileURLToPath as __xUrl } from 'node:url'",
    'const __xSelf = __xUrl(import.meta.url)',
    'const __xRepo = __xResolve(__xDir(__xSelf), "..")',
    'const __xComposition = __xJoin(__xRepo, "presets", "agenia", "agent.cordis.yml")',
    'const __xLines = __xRead(__xComposition, "utf8").split(/\\r?\\n/)',
    'const __xStart = __xLines.findIndex((line) => line.trim() === "- id: agenia-dashboard")',
    'let __xEnd = __xStart + 1',
    'while (__xEnd < __xLines.length && !/^- /.test(__xLines[__xEnd])) __xEnd += 1',
    'const __xBlock = __xStart < 0 ? [] : __xLines.slice(__xStart, __xEnd)',
    'const __xShaOf = (file) => __xSha("sha256").update(__xRead(file)).digest("hex").toUpperCase()',
    'const __xWitness = {',
    '  at: new Date().toISOString(),',
    '  argv: process.argv.slice(2),',
    '  cwd: process.cwd(),',
    '  row_found: __xStart >= 0,',
    '  marker: __xBlock.some((line) => /^ {2}#\\s*@host-level\\b/.test(line)),',
    '  disabled: __xBlock.some((line) => /^ {2}disabled:\\s*true\\s*$/.test(line)),',
    '  generator_sha256: __xShaOf(__xSelf),',
    '  composition_sha256: __xShaOf(__xComposition),',
    '}',
    `__xWrite('${out}', JSON.stringify(__xWitness, null, 2) + '\\n', 'utf8')`,
    'process.stderr.write("WITNESS-GENERATOR：这一步是被注入的失败（不许写补丁）\\n")',
    'process.exit(1)',
    '',
  ].join('\n')
  return `${header}${realText}`
}

/**
 * 失败 stub（`UMH-05` 的 `verify-fails` 腿）：**成功但产物不翻面** —— 先留一个"我被调用过"的见证，再退出 0，
 * **一个字节的补丁都不写**。工具的**自证**那一步必须发现落点没翻面 ⇒ 回滚。
 */
export function stalePatchStub(outFile) {
  const out = String(outFile).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  return [
    '// ── 失败 stub（`UMH-05` 的 `verify-fails` 腿的夹具；不是产品代码）────────────',
    "import { writeFileSync as __sWrite } from 'node:fs'",
    `const HOST_LEVEL_IDS = Object.freeze(['${ROW_ID}'])`,
    `__sWrite('${out}', JSON.stringify({ at: new Date().toISOString(), called: true, mode: 'stale-patch-stub' }, null, 2) + '\\n', 'utf8')`,
    'process.exit(0)',
    '',
  ].join('\n')
}

// ── 假工具（七把刀；每一个都**故意缺**一件必需的事）────────────────────────
/**
 * 每个假工具都收 `--repo`（与真工具同形），stdout 打一行 JSON（契约 §四.1 的键），退出码按刀的需要。
 * 它们**不**读 `--id`：刀的输入永远只有 `agenia-dashboard`。
 * 🔴 它们是**判据的刀**，不是实现的参考稿：每一个都缺一件必需的事（写盘 / 派生 / 拒绝 / 回滚 / 幂等）。
 */
const FAKE_PRELUDE = [
  '// ── 假工具（`UMH-*` 的刀；故意缺一件必需的事，不是实现的参考稿）──────────────',
  "import { readFileSync, writeFileSync } from 'node:fs'",
  "import path from 'node:path'",
  'const argv = process.argv.slice(2)',
  'const arg = (name) => { const i = argv.indexOf("--" + name); return i < 0 ? null : argv[i + 1] }',
  'const repo = path.resolve(arg("repo") ?? ".")',
  'const composition = path.join(repo, "presets", "agenia", "agent.cordis.yml")',
  'const emit = (o) => process.stdout.write(JSON.stringify({ schema: 1, id: "agenia-dashboard", repo, carrier: null, failed_step: null, rolled_back: false, ...o }) + "\\n")',
  '',
].join('\n')

/** 往组合尾部多写一个换行（"我没改"是句谎话）。 */
const APPEND_NEWLINE = 'writeFileSync(composition, readFileSync(composition, "utf8") + "\\n", "utf8")'

export const FAKE_TOOL = Object.freeze({
  /** `K1`：printf 说 `{0,2}`，**一个字节都不写**（判据如果读 printf，这一把就绿了）。 */
  printfLiar: () => [
    FAKE_PRELUDE,
    'emit({ action: "apply", code: "UMH-APPLIED", changed: 3, row_landing: { insert: 0, preset_bodies: 2 } })',
    'process.exit(0)',
    '',
  ].join('\n'),
  /** `K2`：不碰载体，直接把补丁文件换成"看起来对"的那份字节（伪造派生物）。 */
  forgePatch: (forgedFile) => [
    FAKE_PRELUDE,
    `writeFileSync(path.join(repo, "presets", "agenia", "cordis.patch.yml"), readFileSync(${JSON.stringify(forgedFile)}))`,
    'emit({ action: "apply", code: "UMH-APPLIED", changed: 3, row_landing: { insert: 0, preset_bodies: 2 } })',
    'process.exit(0)',
    '',
  ].join('\n'),
  /** `K3`：恒成功、恒 `changed: 0`（该拒绝的地方静默放行；未知 id 也当成功）。 */
  silentProceed: () => [
    FAKE_PRELUDE,
    'emit({ action: "apply", code: "UMH-APPLIED", changed: 0, row_landing: { insert: 0, preset_bodies: 2 } })',
    'process.exit(0)',
    '',
  ].join('\n'),
  /** `K4`：拒绝，但报**另一个**载体的码（两条负控的码写反）。 */
  wrongCarrier: (code, carrier) => [
    FAKE_PRELUDE,
    `emit({ action: "apply", code: ${JSON.stringify(code)}, changed: 0, row_landing: null, carrier: ${JSON.stringify(carrier)} })`,
    'process.exit(2)',
    '',
  ].join('\n'),
  /** `K5`：幂等那一步恒报 `changed: 1`（字节不动）。 */
  alwaysChanged: () => [
    FAKE_PRELUDE,
    'emit({ action: "apply", code: "UMH-APPLIED", changed: 1, row_landing: { insert: 0, preset_bodies: 2 } })',
    'process.exit(0)',
    '',
  ].join('\n'),
  /** `K6`：报 no-op，但往组合尾部多写一个换行。 */
  noopTouchesBytes: () => [
    FAKE_PRELUDE,
    APPEND_NEWLINE,
    'emit({ action: "apply", code: "UMH-NOOP", changed: 0, row_landing: { insert: 0, preset_bodies: 2 } })',
    'process.exit(0)',
    '',
  ].join('\n'),
  /** `K7`：**先跳到"三处都写好了"那一刻**（把夹具算好的两份文本拷进去），再跑生成器，退出 1，**不还原**。 */
  jumpToUnmountedThenNoRollback: (compFile, genFile) => [
    FAKE_PRELUDE,
    "import { spawnSync } from 'node:child_process'",
    "import { copyFileSync } from 'node:fs'",
    `copyFileSync(${JSON.stringify(compFile)}, composition)`,
    `copyFileSync(${JSON.stringify(genFile)}, path.join(repo, ".tools", "make-bundle-patch.mjs"))`,
    'const gen = spawnSync(process.execPath, [path.join(repo, ".tools", "make-bundle-patch.mjs")], { cwd: repo, encoding: "utf8" })',
    'emit({ action: "apply", code: "E_UNMOUNT_STEP_FAILED", changed: 0, row_landing: null, failed_step: "generator", rolled_back: true })',
    'process.stderr.write("K7: generator exit=" + gen.status + "; no rollback\\n")',
    'process.exit(1)',
    '',
  ].join('\n'),
})

// ── 刀 K9：把真工具改坏一行（不是另写一个假工具）────────────────────────────
/**
 * **刀 K9**：把真工具的 no-op 落点检查摘掉（退回到"补丁文件在就行"），其余一字不动 ——
 * 这正是 round-4 那个洞的形状：载体翻过的树 + 旧补丁 ⇒ `exit 0 · UMH-NOOP`，一条红都没有。
 *
 * 怎么改：`code: 'E_UNMOUNT_PATCH_STALE'` 在工具里**只有一处** ⇒ 拿它当锚，把它**之前**最近的那个
 * `if (landing.insert !== want.insert || landing.preset_bodies !== want.preset_bodies) {` 换成 `if (false) {`。
 * 为什么不用 replaceAll：那个条件在工具里出现两次（no-op 分支 + 自证步），replaceAll 会把自证那一步也切掉
 * ⇒ 刀就切到别处去了（`UMH-KNIFE-VECTOR` 的教训：刀切宽了，红因就指不准）。
 *
 * @returns {{text:string, applied:boolean, why:string|null}}  `applied:false` ⇒ 刀没装上（判据要红，不是静默）
 */
export function staleBlindTool(realText) {
  const text = String(realText)
  const anchor = "code: 'E_UNMOUNT_PATCH_STALE'"
  const cond = 'if (landing.insert !== want.insert || landing.preset_bodies !== want.preset_bodies) {'
  const atAnchor = text.indexOf(anchor)
  if (atAnchor < 0) return { text, applied: false, why: `工具文本里找不到锚点 ${anchor}（工具改过？刀没装上）` }
  const at = text.lastIndexOf(cond, atAnchor)
  if (at < 0) return { text, applied: false, why: `锚点之前找不到那个 \`want\` 检查（工具改过？刀没装上）` }
  const patched = `${text.slice(0, at)}if (false) { // 刀 K9：want 检查被摘掉（只剩"补丁文件在"）${text.slice(at + cond.length)}`
  return { text: patched, applied: patched !== text, why: patched === text ? '刀一个字节都没改到' : null }
}

// ── 一次跑：搭夹具 → 跑 → 读回 ────────────────────────────────────────────
/** 量一次副本 + 活树（`runScenario` / `runAgain` 共用；**只读**）。 */
function measure(copy) {
  const texts = readFixtureBase(copy)
  const patchAbs = path.join(copy, REL.patch)
  const patchText = existsSync(patchAbs) ? readFileSync(patchAbs, 'utf8') : ''
  return {
    tree: snapshotTree(copy),
    live: liveSentinel(),
    carriers: carrierFacts(texts),
    landing: patchText === '' ? null : rowLanding(patchText),
  }
}

const bytesOf = (snap, rel) => {
  const hit = snap.find((x) => x.rel === rel)
  return hit === undefined ? null : hit.sha256
}

/** 把"跑之前 / 跑 / 跑之后"收成一份读数（每一格只从这里取，不再自己读盘）。 */
function summarize({ name, pre, generator, tool, action, id, copy, dir, tool_present, before, run, after, checkRun, witness, extra = {} }) {
  return {
    name, pre, generator, tool, action, id,
    copy, dir, tool_present,
    exit: run.status, signal: run.signal, tool_error: run.error,
    stdout: run.stdout, stderr: run.stderr, json: run.json, json_error: run.json_error,
    json_lines: run.json_lines, stdout_lines: run.stdout_lines, args: run.args ?? [],
    before: {
      carriers: before.carriers, landing: before.landing, tree_files: before.tree.length,
      files: { composition: bytesOf(before.tree, REL.composition), generator: bytesOf(before.tree, REL.generator), patch: bytesOf(before.tree, REL.patch) },
      files_map: Object.fromEntries(before.tree.map((x) => [x.rel, x.sha256])),
    },
    after: {
      carriers: after.carriers, landing: after.landing, tree_files: after.tree.length,
      files: { composition: bytesOf(after.tree, REL.composition), generator: bytesOf(after.tree, REL.generator), patch: bytesOf(after.tree, REL.patch) },
      files_map: Object.fromEntries(after.tree.map((x) => [x.rel, x.sha256])),
    },
    files_equal: [REL.composition, REL.generator, REL.patch].every((rel) => bytesOf(before.tree, rel) === bytesOf(after.tree, rel)),
    tree_equal: JSON.stringify(before.tree.map((x) => `${x.rel}:${x.sha256}`)) === JSON.stringify(after.tree.map((x) => `${x.rel}:${x.sha256}`)),
    changed_files: before.tree.filter((x) => bytesOf(after.tree, x.rel) !== x.sha256).map((x) => x.rel)
      .concat(after.tree.filter((x) => bytesOf(before.tree, x.rel) === null).map((x) => `+${x.rel}`))
      .concat(before.tree.filter((x) => bytesOf(after.tree, x.rel) === null).map((x) => `-${x.rel}`)),
    live_touched: sentinelDiff(before.live, after.live),
    generator_called: witness !== null,
    witness,
    check: checkRun === null ? null : { status: checkRun.status, stdout: checkRun.stdout.slice(0, 4000), stderr: checkRun.stderr.slice(0, 2000) },
    ...extra,
  }
}

/**
 * 搭一棵副本、造入口态、装生成器 / 工具、**量活树哨兵**、跑一发、读回。
 *
 * @param {{name:string, pre?:'M'|'B'|'C'|'U', generator?:'real'|'witness'|'stub', tool?:'real'|keyof FAKE_TOOL,
 *          fakeArgs?:string[], toolText?:string|null, action?:'apply'|'restore', id?:string, check?:boolean,
 *          extraArgs?:string[], extraCopyFiles?:Record<string,string>, witnessOutFile?:string,
 *          sourceRepo?:string}} spec
 *   `sourceRepo` 只给**夹具**用（阳性对照要从一棵带"照契约写对的工具"的探针树取材）；判据永远用缺省值 = 产品树。
 *   `toolText` 是**真工具改坏一行**之后的文本（刀 K9 用：把 want 检查摘掉）——它装进副本的 `.tools/`，
 *   所以 `tool_present` 仍是 true、`runTool()` 照跑；`tool` 那一格记成 `mutated`，读数里看得出来跑的不是产品那份。
 */
export function runScenario(spec) {
  const {
    name, pre = 'M', generator = 'real', tool = 'real', fakeArgs = [],
    toolText = null, action = 'apply', id = ROW_ID, check = false, extraArgs = [],
    extraCopyFiles = {}, witnessOutFile = null, sourceRepo = PATHS.repo,
  } = spec
  const dir = scratchDir(name)
  const copy = path.join(dir, 'copy')
  const copied = copyFixture(copy, { repo: sourceRepo })
  const witnessOut = witnessOutFile ?? path.join(dir, 'generator-called.json')

  // ① 入口态（文本只在内存里改，落盘一次）
  const base = readFixtureBase(copy)
  const state = preState(pre, base)
  writeFileSync(path.join(copy, REL.composition), state.compositionText, 'utf8')
  writeFileSync(path.join(copy, REL.generator), state.generatorText, 'utf8')

  // ①' U 态是**一致的树**：补丁也要跟着重新派生（否则"入口态 U + 补丁仍挂载"是一棵假的 U 树）
  let fixtureGenerator = null
  if (pre === 'U' && generator === 'real') {
    const g = spawnNode(path.join(copy, REL.generator), [], { cwd: copy })
    fixtureGenerator = { status: g.status, stderr: g.stderr.slice(0, 1000) }
  }

  // ② 生成器替换（见证 / stub）—— 必须在入口态**之后**（见证要包着改过的那份正文）
  if (generator === 'witness') {
    const live = readFileSync(path.join(copy, REL.generator), 'utf8')
    writeFileSync(path.join(copy, REL.generator), witnessGenerator(live, witnessOut), 'utf8')
  } else if (generator === 'stub') {
    writeFileSync(path.join(copy, REL.generator), stalePatchStub(witnessOut), 'utf8')
  } else if (generator !== 'real') {
    throw new Error(`没有这种生成器模式：${generator}`)
  }

  // ②' 夹具直接摆位（`K7` 用：「三处都写好了、生成器还没跑」那一刻）
  for (const [rel, text] of Object.entries(extraCopyFiles)) {
    const abs = path.join(copy, rel)
    mkdirSync(path.dirname(abs), { recursive: true })
    writeFileSync(abs, text, 'utf8')
  }

  // ③ 工具：真的一份（不在盘上 ⇒ 记 tool_present:false）· 一把假刀 · 或"真工具改坏一行"的变体（`toolText`）
  let toolSource = 'real'
  if (toolText !== null) {
    writeFileSync(path.join(copy, REL.tool), String(toolText), 'utf8')
    toolSource = 'mutated'
  } else if (tool === 'real') {
    // 源里没有工具 ⇒ 副本里本来就没有（`copyFixture` 只在存在时复制）—— 不删任何东西。
  } else {
    const fake = FAKE_TOOL[tool]
    if (fake === undefined) throw new Error(`没有这把假刀：${tool}`)
    writeFileSync(path.join(copy, REL.tool), fake(...fakeArgs), 'utf8')
    toolSource = `fake:${tool}`
  }

  const before = measure(copy)
  const run = toolSource === 'real' && !copied.tool_present
    ? { status: null, signal: null, stdout: '', stderr: '', error: 'TOOL-ABSENT', json: null, json_error: '工具不在盘上', json_lines: 0, stdout_lines: [], args: [] }
    : runTool(copy, { action, id, extraArgs })
  const after = measure(copy)
  const checkRun = check ? runGeneratorCheck(copy) : null
  const witness = existsSync(witnessOut) ? JSON.parse(readFileSync(witnessOut, 'utf8')) : null

  return summarize({
    name, pre, generator, tool: toolSource, action, id, copy, dir,
    tool_present: copied.tool_present, before, run, after, checkRun, witness,
    extra: { want_carriers: state.want_carriers, fixture_generator: fixtureGenerator },
  })
}

/**
 * 在**同一棵副本**上再跑一发（`--apply` 两次 / `apply` 之后 `restore` —— 幂等与"来回一圈"都靠它）。
 * @param {object} readings `runScenario()` 的返回
 */
export function runAgain(readings, { action = 'apply', id = ROW_ID, check = false } = {}) {
  const copy = readings.copy
  const before = measure(readings.copy)
  const run = runTool(copy, { action, id })
  const after = measure(copy)
  const checkRun = check ? runGeneratorCheck(copy) : null
  const tree_unchanged = JSON.stringify(before.tree) === JSON.stringify(after.tree)
  return summarize({
    name: `${readings.name}+${action}`, pre: readings.pre, generator: readings.generator, tool: readings.tool,
    action, id, copy, dir: readings.dir, tool_present: readings.tool_present, before, run, after, checkRun, witness: null,
    extra: { tree_unchanged, second_run: true },
  })
}

/**
 * 一份**一致的 U 态**组合 + 生成器文本（`K7` 用它把树直接摆到"三处都写好了"那一刻）。
 * 纯文本，不碰盘；判据不拿它当"期望的产物"（契约 §5.0）。
 */
export function unmountedTexts() {
  const state = preState('U', {
    compositionText: readFileSync(SOURCE.composition, 'utf8'),
    generatorText: readFileSync(SOURCE.generator, 'utf8'),
  })
  return { compositionText: state.compositionText, generatorText: state.generatorText }
}

/**
 * 在**真生成器**上跑一份 U 态树，把产出的补丁存成一个文件（`K2 forge-patch` 的伪造输入）。
 * @returns {{ok:boolean, file:string|null, status:number|null, stderr:string}}
 */
export function forgedPatchOf(name) {
  const dir = scratchDir(name)
  const copy = path.join(dir, 'copy')
  copyFixture(copy)
  const state = preState('U', readFixtureBase(copy))
  writeFileSync(path.join(copy, REL.composition), state.compositionText, 'utf8')
  writeFileSync(path.join(copy, REL.generator), state.generatorText, 'utf8')
  const g = spawnNode(path.join(copy, REL.generator), [], { cwd: copy })
  if (g.status !== 0) return { ok: false, file: null, status: g.status, stderr: g.stderr.slice(0, 1500) }
  const file = path.join(dir, 'forged-patch.yml')
  writeFileSync(file, readFileSync(path.join(copy, REL.patch)))
  return { ok: true, file, status: 0, stderr: '' }
}

/** 只读副本的三份文本（`preState()` 的输入；不改盘）。 */
function readFixtureBase(copy) {
  return {
    compositionText: readFileSync(path.join(copy, REL.composition), 'utf8'),
    generatorText: readFileSync(path.join(copy, REL.generator), 'utf8'),
  }
}

// ══ 判据本体（`UMH-01`…`UMH-05` 的 `problems` 从这几把尺子出来）══════════════════════
//
// 🔴 为什么在这里、不在用例文件里：本文件的假工具（刀）与真工具走**同一份**判读函数；
//    阳性对照（一份照契约写对的工具）也走同一份 ⇒ "该绿时绿、该红时红"是同一个函数翻的两面。
//    用例文件只负责搭夹具、挑刀、登记腿。
/** 这一族自己的码（判据层的；工具自己的码是 `UMH-*` / `E_UNMOUNT_*`，报文里分开写）。 */
export const CODE = {
  toolAbsent: 'UMH-TOOL-ABSENT',
  fixture: 'UMH-FIXTURE-BROKEN',
  rulerControl: 'UMH-RULER-CONTROL',
  liveTouched: 'UMH-LIVE-TREE-TOUCHED',
  notJson: 'UMH-STDOUT-NOT-JSON',
  exit: 'UMH-EXIT-CODE',
  code: 'UMH-CODE',
  landing: 'UMH-LANDING-MISMATCH',
  landingPrinted: 'UMH-LANDING-PRINTED-DISAGREES',
  notDerived: 'UMH-PATCH-NOT-DERIVED',
  carriers: 'UMH-CARRIERS',
  notInverse: 'UMH-RESTORE-NOT-INVERSE',
  refusalExit: 'UMH-REFUSAL-EXIT',
  refusalCode: 'UMH-REFUSAL-CODE',
  carrierNamedWrong: 'UMH-CARRIER-NAMED-WRONG',
  refusalChanged: 'UMH-REFUSAL-CHANGED',
  refusalWrote: 'UMH-REFUSAL-WROTE',
  refusalRanGenerator: 'UMH-REFUSAL-RAN-GENERATOR',
  usageSilentGreen: 'UMH-USAGE-SILENT-GREEN',
  staleNoop: 'UMH-STALE-PATCH-NOOP',
  staleUnnamed: 'UMH-STALE-PATCH-UNNAMED',
  changedNotZero: 'UMH-CHANGED-NOT-ZERO',
  noopTouchedBytes: 'UMH-NOOP-TOUCHED-BYTES',
  rollbackBytes: 'UMH-ROLLBACK-NOT-BYTE-IDENTICAL',
  rollbackStep: 'UMH-ROLLBACK-STEP',
  rollbackFlag: 'UMH-ROLLBACK-FLAG',
  rollbackSilent: 'UMH-ROLLBACK-SILENT',
  injectionNotReached: 'UMH-INJECTION-NOT-REACHED',
  knifeNotBiting: 'UMH-KNIFE-NOT-BITING',
  knifeVector: 'UMH-KNIFE-VECTOR',
  controlNotGreen: 'UMH-CONTROL-NOT-GREEN',
  legsIncomplete: 'UMH-LEGS-INCOMPLETE',
}

/** 活树三份的入口态读数（判据的**前提**：产品树今天必须是 M 态；不是 ⇒ 夹具坏了，不是产品坏了）。 */
export function liveEntryState() {
  return {
    carriers: carrierFacts({
      compositionText: readFileSync(SOURCE.composition, 'utf8'),
      generatorText: readFileSync(SOURCE.generator, 'utf8'),
    }),
    landing: rowLanding(readFileSync(SOURCE.patch, 'utf8')),
  }
}

/** 读数瘦身（进 `result.json` 的那一份：够复现，不塞整份 stdout）。 */
export function slim(r) {
  return {
    name: r.name, pre: r.pre, generator: r.generator, tool: r.tool, action: r.action, id: r.id,
    tool_present: r.tool_present, exit: r.exit, signal: r.signal, tool_error: r.tool_error,
    json: r.json, json_error: r.json_error, json_lines: r.json_lines,
    stderr_head: String(r.stderr ?? '').split(/\r?\n/).slice(0, 6).join('\n').slice(0, 1200),
    stdout_head: String(r.stdout ?? '').split(/\r?\n/).slice(0, 6).join('\n').slice(0, 1200),
    before: r.before,
    after: { carriers: r.after.carriers, landing: r.after.landing, tree_files: r.after.tree_files, files: r.after.files },
    files_equal: r.files_equal, tree_equal: r.tree_equal, changed_files: r.changed_files,
    live_touched: r.live_touched, generator_called: r.generator_called, witness: r.witness,
    check: r.check === null ? null : { status: r.check.status, stderr_head: String(r.check.stderr ?? '').slice(0, 600) },
    copy: path.relative(PATHS.repo, r.copy).replace(/\\/g, '/'),
  }
}

/**
 * 一条腿的登记器：`legs` 少了哪一条由 `UMH-LEGS-INCOMPLETE` 点名（"没判"不许长得像"判过了"）。
 * `fn` 返回一个字符串 ⇒ 这一条腿**跳过**（工具缺位等），登记成 `skipped`，绝不当绿。
 */
export function legBook(problems) {
  const legs = {}
  return {
    legs,
    run(name, fn) {
      const from = problems.length
      const skipped = fn()
      legs[name] = typeof skipped === 'string'
        ? { ok: false, skipped }
        : { ok: problems.length === from, codes: problems.slice(from).map((p) => p.code) }
    },
    require(list) {
      const missing = list.filter((name) => !(name in legs))
      if (missing.length > 0) {
        problems.push(problem(CODE.legsIncomplete, `这些腿一条都没跑：${missing.join(' / ')} —— 没判过的格不许当绿（契约 §七 / §5.0）`))
      }
    },
  }
}

// ── 判读函数（纯的；真工具与刀走**同一份**）───────────────────────────────
/** ① 落点：补丁文本说了算；工具打印的只是第二个读数。 */
export function landingProblems(r, { insert, presetBodies, label }) {
  const out = []
  const got = r.after.landing
  if (got === null || got === undefined) {
    out.push(problem(CODE.landing, `${label}：补丁文本读不出落点（补丁不在 / 读不懂）`))
  } else if (got.insert !== insert || got.preset_bodies !== presetBodies) {
    out.push(problem(CODE.landing, `${label}：尺子从**补丁文本**算出 insert=${got.insert} / preset_bodies=${got.preset_bodies}，`
      + `期望 ${insert} / ${presetBodies} —— 判据读的是生成器写出来的那份文件，不是工具的 printf`))
  }
  const printed = r.json?.row_landing ?? null
  if (printed === null) {
    out.push(problem(CODE.landingPrinted, `${label}：工具没打 \`row_landing\`（契约 §四.1）—— 两个读数缺一个`))
  } else if (got !== null && got !== undefined && (printed.insert !== got.insert || printed.preset_bodies !== got.preset_bodies)) {
    out.push(problem(CODE.landingPrinted, `${label}：工具打印 row_landing=${JSON.stringify(printed)}，补丁文本是 `
      + `insert=${got.insert} / preset_bodies=${got.preset_bodies} —— 两处必须说同一件事（以补丁为准）`))
  }
  return out
}

/** ② 补丁是不是**派生物**（`--check` exit 0）。 */
export function derivedProblems(r, label) {
  const out = []
  if (r.check === null || r.check === undefined) {
    out.push(problem(CODE.notDerived, `${label}：这一腿没跑 \`make-bundle-patch.mjs --check\` —— "补丁是派生物"没人判`))
  } else if (r.check.status !== 0) {
    out.push(problem(CODE.notDerived, `${label}：\`--check\` exit ${r.check.status} ⇒ 盘上补丁与组合**对不上**：`
      + '它不是从被改过的组合 + 名单派生出来的（有人直接换了补丁字节；或生成器步没跑）'))
  }
  return out
}

/** ③ 退出码 / 码 / changed。 */
export function shapeProblems(r, { exit, code, changed, label }) {
  const out = []
  if (r.exit !== exit) {
    out.push(problem(CODE.exit, `${label}：exit ${r.exit}，期望 ${exit}（stderr 头：${String(r.stderr ?? '').slice(0, 300)}）`))
  }
  if (code !== undefined && r.json?.code !== code) {
    out.push(problem(CODE.code, `${label}：code=${JSON.stringify(r.json?.code)}，期望 ${JSON.stringify(code)}`))
  }
  if (changed !== undefined && r.json?.changed !== changed) {
    out.push(problem(CODE.changedNotZero, `${label}：changed=${JSON.stringify(r.json?.changed)}，期望 ${changed}`))
  }
  return out
}

/** ④ 三个载体（A / C 读文本；B 只读"生成器文件被改过"这个后果，不读形状）。 */
export function carrierProblems(r, { marker, disabled, label }) {
  const out = []
  const got = r.after.carriers
  if (got.marker !== marker) {
    out.push(problem(CODE.carriers, `${label}：组合里 \`# @host-level\` ${got.marker ? '还在' : '不在'}，期望 ${marker ? '在' : '不在'}`))
  }
  if (got.disabled !== disabled) {
    out.push(problem(CODE.carriers, `${label}：那一行的 \`disabled: true\` ${got.disabled ? '在' : '不在'}，期望 ${disabled ? '在' : '不在'}`
      + '（契约 §一.2 的载体 C：客户端 UI 行留在预设体里必须是关着的）'))
  }
  if (r.before.files.generator === r.after.files.generator && ['apply', 'restore'].includes(r.action) && r.exit === 0) {
    out.push(problem(CODE.carriers, `${label}：生成器文件一个字节都没变 —— 名单那一处（载体 B）没被改过`))
  }
  return out
}

/** ⑤ 拒绝：exit 2 + 点名载体 + 一个字节不写 + 生成器一次都没被调用。 */
export function refusalProblems(r, { code, carrier, label }) {
  const out = []
  if (r.exit !== 2) out.push(problem(CODE.refusalExit, `${label}：exit ${r.exit}，期望 2（拒绝）。入口态不一致时不许继续`))
  if (r.json?.code !== code) {
    out.push(problem(CODE.refusalCode, `${label}：code=${JSON.stringify(r.json?.code)}，期望 ${JSON.stringify(code)}`))
  }
  if (r.json?.carrier !== carrier) {
    out.push(problem(CODE.carrierNamedWrong, `${label}：carrier=${JSON.stringify(r.json?.carrier)}，期望 ${JSON.stringify(carrier)} `
      + '—— 两条负控必须是两个不同的码/载体，写反与写成都算错'))
  }
  if (r.json?.changed !== 0) out.push(problem(CODE.refusalChanged, `${label}：changed=${JSON.stringify(r.json?.changed)}，拒绝必须是 0`))
  if (!r.files_equal) out.push(problem(CODE.refusalWrote, `${label}：拒绝之后字节变了：${JSON.stringify(r.changed_files)}`))
  if (r.generator_called) {
    out.push(problem(CODE.refusalRanGenerator, `${label}：拒绝之前**调用过生成器**（见证文件在）—— 前置检查不许外包给生成器：`
      + '那时盘上已经写了一半，证据就毁了（契约 §三 D-2）'))
  }
  return out
}

/** ⑥ 回滚：exit 1 + `failed_step` + `rolled_back` + 字节 / 文件集合回到跑之前。 */
export function rollbackProblems(r, { step, label }) {
  const out = []
  if (r.exit !== 1) out.push(problem(CODE.exit, `${label}：exit ${r.exit}，期望 1（失败并回滚）`))
  if (r.json?.code !== 'E_UNMOUNT_STEP_FAILED') {
    out.push(problem(CODE.code, `${label}：code=${JSON.stringify(r.json?.code)}，期望 \`E_UNMOUNT_STEP_FAILED\``))
  }
  if (r.json?.failed_step !== step) {
    out.push(problem(CODE.rollbackStep, `${label}：failed_step=${JSON.stringify(r.json?.failed_step)}，期望 ${JSON.stringify(step)} —— 工具必须说清是哪一步失败`))
  }
  if (r.json?.rolled_back !== true) out.push(problem(CODE.rollbackFlag, `${label}：rolled_back=${JSON.stringify(r.json?.rolled_back)}，期望 true`))
  if (r.json?.changed !== 0) out.push(problem(CODE.rollbackFlag, `${label}：回滚之后 changed=${JSON.stringify(r.json?.changed)}，期望 0（净改动）`))
  if (!String(r.stderr ?? '').trim()) out.push(problem(CODE.rollbackSilent, `${label}：stderr 是空的 —— 失败原因在 stdout 的 JSON 里有，人话这一路上也得留一句`))
  if (!r.files_equal) {
    out.push(problem(CODE.rollbackBytes, `${label}：回滚之后**两份载体文件没有逐字节回到跑之前**：`
      + `变了 ${JSON.stringify(r.changed_files)} —— 这一格判的是字节，不是"没报错"`))
  }
  if (!r.tree_equal) {
    out.push(problem(CODE.rollbackBytes, `${label}：回滚之后**文件集合**与跑之前不同（工具留了账本 / 临时件？）：`
      + `变了 ${JSON.stringify(r.changed_files)} —— 副本的文件集合必须回到跑之前`))
  }
  return out
}

/** ⑦ 幂等：no-op ⇒ `UMH-NOOP` / `changed: 0` / 字节不动 / 落点仍是目标态。 */
export function noopProblems(r, { insert, presetBodies, label }) {
  const out = [...shapeProblems(r, { exit: 0, code: 'UMH-NOOP', changed: 0, label })]
  out.push(...landingProblems(r, { insert, presetBodies, label }))
  if (!r.files_equal) out.push(problem(CODE.noopTouchedBytes, `${label}：no-op 之后字节变了：${JSON.stringify(r.changed_files)}`))
  if (!r.tree_equal) out.push(problem(CODE.noopTouchedBytes, `${label}：no-op 之后文件集合变了：${JSON.stringify(r.changed_files)}`))
  return out
}

/**
 * ⑧ 半截的树：入口已经是这一步的目标态，但盘上补丁的落点**不是**目标落点。
 *
 * 这是 no-op 分支的另一面（`⑦` 判"落点对 ⇒ 还是 no-op"）：载体翻过了、生成器没翻过补丁
 * （上一次跑到 ③ 被打断 / 并发的两个 `--apply`）⇒ 必须**具名拒绝**（exit 1 · `E_UNMOUNT_PATCH_STALE`），
 * 一个字节都不写，而且**不许调用生成器**（跑一发生成器会把补丁"顺手"修好，把"被打断过"的证据抹掉）。
 *
 * 为什么"补丁文件在不在"不够：那正是 round-4 的洞 —— 载体翻过的树 + 旧补丁 ⇒ `exit 0 · UMH-NOOP`，
 * 一条红都没有。所以这一面钉的是**落点**，不是"文件存在"。
 *
 * @returns {object[]} 有问题就返回；空 = 这一格过
 */
export function stalePatchProblems(r, { label }) {
  const out = []
  const code = r.json?.code ?? null
  const stale = r.before?.landing ?? null
  if (r.exit === 0 || code === 'UMH-NOOP') {
    out.push(problem(CODE.staleNoop, `${label}：入口已经是 --apply 的目标态，但盘上补丁的落点还是 ${JSON.stringify(stale)}`
      + `（不是 {insert:0,preset_bodies:2}）⇒ 工具 exit ${r.exit} / code=${JSON.stringify(code)}：`
      + '把一棵**半截的树**记成了 no-op。载体翻过了、补丁没跟着翻 —— 这是"上一次跑到生成器那一步被打断"的形状，'
      + '静默放行等于把证据抹掉（契约 §二 · §4.2）'))
  } else if (code !== STALE_CODE) {
    out.push(problem(CODE.staleUnnamed, `${label}：工具没把 no-op 记成成功，但也没点名这是"补丁过期"：`
      + `code=${JSON.stringify(code)}，期望 ${JSON.stringify(STALE_CODE)} —— 一个不说清是哪件事的失败，`
      + '读的人分不出"入口态不合法"（exit 2）与"树被中断过"（这一支）'))
  } else if (r.exit !== 1) {
    out.push(problem(CODE.exit, `${label}：exit ${r.exit}，期望 1 —— 补丁过期是**失败**（这一跑什么都没写），`
      + '不是"入口态不是规范态"的拒绝（那是 exit 2）'))
  }
  if (r.json?.changed !== 0) {
    out.push(problem(CODE.refusalChanged, `${label}：changed=${JSON.stringify(r.json?.changed)}，这一跑一个字节都不该写`))
  }
  if (!r.files_equal) out.push(problem(CODE.refusalWrote, `${label}：之后载体文件的字节变了：${JSON.stringify(r.changed_files)}`))
  if (!r.tree_equal) out.push(problem(CODE.refusalWrote, `${label}：之后文件集合变了（留了临时件 / 账本）：${JSON.stringify(r.changed_files)}`))
  if (r.generator_called) {
    out.push(problem(CODE.refusalRanGenerator, `${label}：**调用过生成器**（见证文件在）—— 这一跑一个字节都没写，`
      + '跑生成器只会把补丁顺手修好、把"上一次被打断"的证据抹掉'))
  }
  return out
}

/** ⑨ 未知 id：exit 3，一个字节不写。 */
export function usageProblems(r, label) {
  const out = []
  if (r.exit !== 3) {
    out.push(problem(CODE.usageSilentGreen, `${label}：exit ${r.exit}，期望 3 —— 组合里根本没有那一行时**不许**当 no-op 成功`
      + '（那会把"撤了个不存在的行"记成撤成功）'))
  }
  if (!r.files_equal) out.push(problem(CODE.usageSilentGreen, `${label}：exit=${r.exit} 却写了字节（${JSON.stringify(r.changed_files)}）`))
  return out
}

/** ⑩ 刀：同一份判读函数喂一把假工具，必须吐出**指定**的那一个码（外加事先点名的次生码）。 */
export function knife(problems, { label, got, want, allow = [] }) {
  const codes = got.map((p) => p.code)
  if (!codes.includes(want)) {
    problems.push(problem(CODE.knifeNotBiting, `${label}：这把刀没咬住 —— 判读函数吐出 ${JSON.stringify(codes)}，期望含 ${JSON.stringify(want)}`
      + '（刀不咬 = 这一格的红不是判据给的）'))
    return
  }
  const extra = codes.filter((c) => c !== want && !allow.includes(c))
  if (extra.length > 0) {
    problems.push(problem(CODE.knifeVector, `${label}：这把刀翻多了 ${JSON.stringify(extra)}（这一刀只该翻 ${JSON.stringify([want, ...allow])}）`
      + '—— 刀切宽了，红因就指不准'))
  }
}

/**
 * ⑪ 副本的运行集：`RUNNABLE` 那几份必须在副本里，且与产品树**逐字节**相同。
 *
 * 只判"文件在不在 + 字节一样"，不判工具怎么用它们。为什么单独一条腿：副本里少了
 * `presets/agenia/lib/atomic.mjs` 时，工具（它 import 那份 `writeFileAtomic`）加载即失败
 * （`ERR_MODULE_NOT_FOUND` · exit 1 · 零 stdout）—— 五格会红在一个**与产品无关**的事上，
 * 而"夹具被剪了一角"看起来会像"工具坏了"。所以这一面要能单独翻面（刀 K8）。
 *
 * @param {{files_map?:Record<string,string>}} before  `runScenario()` 里跑之前那份副本（`slim()` 会丢掉它）
 * @returns {object[]} 有问题就返回；空 = 运行集完整
 */
export function runnableSetProblems(before, { label, source = SOURCE } = {}) {
  const out = []
  const map = before?.files_map ?? {}
  for (const key of RUNNABLE) {
    const rel = REL[key]
    const got = map[rel] ?? null
    if (got === null) {
      out.push(problem(CODE.fixture, `${label}：副本里没有 \`${rel}\` —— 工具的运行集少一份：`
        + '副本里的工具加载即失败（ERR_MODULE_NOT_FOUND · exit 1 · 零 stdout），'
        + '这一格会红在一个与产品无关的事上'))
      continue
    }
    const want = existsSync(source[key]) ? sha256OfFile(source[key]) : null
    if (want !== null && got !== want) {
      out.push(problem(CODE.fixture, `${label}：副本里的 \`${rel}\` 与产品树不是同一份字节（${got} ≠ ${want}）`
        + '—— 副本必须是逐字节复制，不许有人"顺手"改它'))
    }
  }
  return out
}

/** 工具缺位时每格都要说同一句话（红因首个；不是 skip、不是 HOLD）。 */
export function pushToolAbsent(problems, r, label) {
  problems.push(problem(CODE.toolAbsent, `${label}：\`${REL.tool}\` 不在盘上（${r.copy}）—— 被测命令不存在，`
    + '这一格判不了 ⇒ RED（不是绿、不是 HOLD、不是 skip）'))
}
