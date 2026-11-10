#!/usr/bin/env node
/**
 * `unmount-host-row` —— 把「某一行是宿主级」这个事实，在**它所有的载体上**一起改掉，并让生成器
 * 重新产出补丁；`--restore` 是它的逆。
 *
 * 一句话：宿主级这套设计有**两份文件、三处载体**（少改一处，生成器自己就拒）：
 *
 *   | 载体 | 文件 | `--apply` 之后 | `--restore` 之后 |
 *   | --- | --- | --- | --- |
 *   | A · 标记 | `presets/agenia/agent.cordis.yml` 的行块（`- id:` 的下一行、两格缩进） | `  # @host-level` 不在 | 在 |
 *   | B · 名单 | `.tools/make-bundle-patch.mjs` 的 `HOST_LEVEL_IDS` | id 不在里面 | 在里面 |
 *   | C · 行字段 | 同一行块（`config` 的兄弟键） | `  disabled: true` 在 | 不在 |
 *
 * 为什么 C 也在这条命令的范围里：生成器只放「关着的客户端 UI 行」进预设体
 * （`KNOWN_CLIENT_UI_IN_PRESET` 要 `{id, package, disabled: true}` 三格全中，`:143-150`；缺 C 就
 * `E_BUNDLE_CLIENT_UI_ENABLED`，`:450`）。撤下宿主级之后那一行就落回预设体，所以
 * `{insert: 0, preset_bodies: 2}` 这个落点**只有三处一起改才到得了**。
 *
 * ## 入口态（只认两个规范态；其余一律拒绝）
 *
 *   M（挂载）= A 在 · B 有 · C 没有；U（撤下）= A 不在 · B 没有 · C 有。
 *   `--apply` 只接 M、目标 U；`--restore` 只接 U、目标 M；入口已经是目标态 ⇒ `UMH-NOOP`。
 *   其余六种组合 ⇒ **exit 2**、`changed: 0`、**一个字节都不写、生成器一次都不调用**，
 *   码点名是哪个载体不在位（`E_UNMOUNT_MARKER_MISSING` / `E_UNMOUNT_LIST_MISSING` /
 *   `E_UNMOUNT_ROW_DISABLED` / `E_UNMOUNT_ROW_NOT_DISABLED`）。
 *   拒绝必须发生在任何写之前：把前置检查外包给生成器 = 让一棵已经写了一半的树去抛，
 *   那时盘上的证据已经毁了。
 *
 * ## 一次 `--apply` / `--restore` 的次序
 *
 *   ① 三处载体先在**内存里**算好（算不出来 ⇒ 还没写就失败）；
 *   ② 写组合、写生成器；
 *   ③ **就地**跑 `<repo>/.tools/make-bundle-patch.mjs`（不 import 它 —— 它加载即 `build()` +
 *      `writeFileSync(TARGET, …)`；只读写它的文本）；
 *   ④ 回读 `<repo>/presets/agenia/cordis.patch.yml`，自己数一遍落点，必须等于
 *      `--apply` 的 `{insert:0, preset_bodies:2}` / `--restore` 的 `{insert:1, preset_bodies:0}`；
 *   ⑤ 任一步失败 ⇒ 组合、生成器、补丁三份文件逐字节回到跑之前（补丁本来是派生物，回滚也要一起回，
 *      否则恢复后的载体与被污染的补丁对不上），exit 1 + `E_UNMOUNT_STEP_FAILED`。
 *
 * ## 根在哪
 *
 * **只有 `--repo <root>`**：全部读写都在它里面。不从 `import.meta.url` 往上爬、不调 git、
 * 不看环境变量 —— 判据把它跑在**没有 `.git` 的副本**上，往上爬会写到活树。
 *
 * ## 用法与退出码
 *
 *   node .tools/unmount-host-row.mjs --repo <root> --id <row id> --apply
 *   node .tools/unmount-host-row.mjs --repo <root> --id <row id> --restore
 *
 *   0 成功（含 no-op）· 1 某一步失败、已回滚 · 2 拒绝（入口态不是规范态）· 3 用法 / 环境
 *
 * stdout 恰好一行 JSON（`schema` / `action` / `id` / `repo` / `code` / `changed` /
 * `row_landing` / `carrier` / `failed_step` / `rolled_back`）；人话走 stderr。
 *
 * 载体 B 的形状不钉：读的是 `HOST_LEVEL_IDS = … [ … ]` 这一个字面量，改的是它里面的项。
 * `--restore` 把 id **追加在表尾**；今天表里只有一条，所以恢复后的字节与 `--apply` 之前逐字节相同。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const EXIT = Object.freeze({ OK: 0, FAILED: 1, REFUSED: 2, USAGE: 3 })

/** 本工具碰的三份文件（相对 `--repo`）。 */
const REL = Object.freeze({
  composition: 'presets/agenia/agent.cordis.yml',
  generator: '.tools/make-bundle-patch.mjs',
  patch: 'presets/agenia/cordis.patch.yml',
})

const MARKER_LINE = '  # @host-level'
const MARKER_LINE_RE = /^ {2}#\s*@host-level\b/
const MARKER_ANY_RE = /@host-level\b/
const DISABLED_LINE = '  disabled: true'
const DISABLED_LINE_RE = /^ {2}disabled:\s*true\s*$/
/** 生成器的点名表字面量：前缀（到 `[`，含）+ 项列表 + `]`。 */
const LIST_RE = /(HOST_LEVEL_IDS\s*=\s*[^[]*\[)([\s\S]*?)\]/

/** 预设入口那一行的 `name`（补丁里用来区分"预设体"与"顶层 insert"）。 */
const REGISTRATION_NAME = '@deepseek-ai/dsh-agent-preset'

const indentOf = (line) => (/^[ ]*/.exec(line) ?? [''])[0].length

/** YAML 标量（只认这份组合里出现的形状：单/双引号、裸值、行尾注释）。 */
function plainScalar(raw) {
  const value = String(raw).trim()
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'")
  if (value.startsWith('"') && value.endsWith('"')) {
    try { return JSON.parse(value) } catch { return value.slice(1, -1) }
  }
  return value.replace(/\s+#.*$/, '').trim()
}

// ── 参数 ──────────────────────────────────────────────────────────────────
/**
 * 只认这四样：`--repo <root>` / `--repo=<root>` · `--id <row id>` / `--id=<row id>` ·
 * `--apply` · `--restore`。多给 / 认不出的写法一律 usage（exit 3）——
 * 一个拼错的 `--restore` 不许静默变成"没给模式"。
 */
function parseArgv(argv) {
  const out = { mode: null, repo: null, id: null, errors: [] }
  const setOnce = (key, value, flag) => {
    if (out[key] !== null) out.errors.push(`${flag} 给了不止一次`)
    else out[key] = value
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i])
    if (arg === '--apply' || arg === '--restore') {
      const mode = arg.slice(2)
      if (out.mode !== null) out.errors.push(`--apply / --restore 只能给一个（已经给了 --${out.mode}）`)
      else out.mode = mode
      continue
    }
    if (arg === '--repo' || arg === '--id') {
      const value = i + 1 < argv.length ? String(argv[i + 1]) : null
      if (value === null || value.startsWith('--')) {
        out.errors.push(`${arg} 没有值`)
        continue
      }
      setOnce(arg.slice(2), value, arg)
      i += 1
      continue
    }
    const eq = /^--(repo|id)=([\s\S]*)$/.exec(arg)
    if (eq !== null) {
      const value = eq[2].trim()
      if (value === '') out.errors.push(`--${eq[1]}= 没有值`)
      else setOnce(eq[1], value, `--${eq[1]}=`)
      continue
    }
    out.errors.push(`不认识的参数：${arg}`)
  }
  return out
}

// ── 文本：行块 / 三处载体 ──────────────────────────────────────────────────
/**
 * 行块：顶格 `- id: <id>` 那一行开始，到下一个顶格 `- ` 之前（含 EOF）。
 * @returns {{start:number, end:number}|null}  `end` 是**不含**
 */
function rowSpan(lines, id) {
  const start = lines.findIndex((line) => line.trim() === `- id: ${id}`)
  if (start < 0) return null
  let end = start + 1
  while (end < lines.length && !/^- /.test(lines[end])) end += 1
  return { start, end }
}

/** 点名表字面量：读出来的项（原始字符串，保留引号写法）+ 拼接用的位置。 */
function listLiteral(generatorText) {
  const hit = LIST_RE.exec(String(generatorText))
  if (hit === null) return null
  const items = hit[2].split(',').map((item) => item.trim()).filter((item) => item !== '')
  return { prefix: hit[1], items, body: hit[2], length: hit[0].length, index: hit.index }
}

/**
 * 三处载体的在 / 不在。
 * @returns {{row_found:boolean, marker:boolean, disabled:boolean, listed:boolean, list_found:boolean,
 *            span:object|null, eol:string, lines:string[]}}
 */
function readCarriers({ compositionText, generatorText, id }) {
  const eol = compositionText.includes('\r\n') ? '\r\n' : '\n'
  const lines = compositionText.split(eol)
  const span = rowSpan(lines, id)
  const list = listLiteral(generatorText)
  const block = span === null ? [] : lines.slice(span.start, span.end)
  return {
    row_found: span !== null,
    marker: span !== null && block.some((line) => MARKER_LINE_RE.test(line)),
    disabled: span !== null && block.some((line) => DISABLED_LINE_RE.test(line)),
    listed: list !== null && list.items.some((item) => plainScalar(item) === id),
    list_found: list !== null,
    span,
    eol,
    lines,
  }
}

/**
 * 八种组合 → 两个规范态或一个具名拒绝。
 *
 * 优先级：① A 与 B 不一致 ⇒ 报**缺的那一个**；② 挂载态却关着；③ 撤下态却没关。
 * 不"顺手收拾"不一致的入口态 —— 那是工具替人决定要不要撤。
 *
 * @returns {{state:'M'|'U'}|{code:string, carrier:'marker'|'list'|'disabled'}}
 */
function classify({ marker, listed, disabled }) {
  if (marker !== listed) {
    return marker
      ? { code: 'E_UNMOUNT_LIST_MISSING', carrier: 'list' }
      : { code: 'E_UNMOUNT_MARKER_MISSING', carrier: 'marker' }
  }
  if (marker && disabled) return { code: 'E_UNMOUNT_ROW_DISABLED', carrier: 'disabled' }
  if (!marker && !disabled) return { code: 'E_UNMOUNT_ROW_NOT_DISABLED', carrier: 'disabled' }
  return { state: marker ? 'M' : 'U' }
}

/**
 * 组合侧的两处载体：删标记（apply）/ 加标记（restore）· 加 `disabled`（apply）/ 删（restore）。
 * 只动这两行，其余字节原样保留；行尾换行跟原文一致（`eol`），所以 `--restore` 能逐字节回到 `--apply` 之前。
 *
 * `disabled` 写在行块**正文末尾**（最后一个非空行之后）—— 与 `config` 的兄弟键、两格缩进；
 * 回滚时按同一行删掉，位置不参与判定。
 *
 * @returns {{text:string, changed:{marker:boolean, disabled:boolean}}}
 */
function editComposition({ carrier, id, mode }) {
  const { eol, lines, span } = carrier
  if (span === null) throw new Error(`组合里没有 \`- id: ${id}\``)
  const next = [...lines]
  let markerChanged = false
  let disabledChanged = false
  if (mode === 'apply') {
    for (let i = next.length - 1; i >= span.start; i -= 1) {
      if (i < span.end && MARKER_ANY_RE.test(next[i])) {
        next.splice(i, 1)
        markerChanged = true
      }
    }
    const spanAfter = rowSpan(next, id)
    let at = spanAfter.end - 1
    while (at > spanAfter.start && next[at].trim() === '') at -= 1
    next.splice(at + 1, 0, DISABLED_LINE)
    disabledChanged = true
  } else {
    for (let i = next.length - 1; i >= span.start; i -= 1) {
      if (i < span.end && DISABLED_LINE_RE.test(next[i])) {
        next.splice(i, 1)
        disabledChanged = true
      }
    }
    const spanAfter = rowSpan(next, id)
    if (spanAfter === null) throw new Error(`组合里没有 \`- id: ${id}\``)
    next.splice(spanAfter.start + 1, 0, MARKER_LINE)
    markerChanged = true
  }
  return { text: next.join(eol), changed: { marker: markerChanged, disabled: disabledChanged } }
}

/**
 * 生成器侧的点名表：拿掉（apply）/ 放回（restore）这一项。
 *
 * **定点改**那一个字面量，不整份重写 —— 判据会在生成器前面插一段见证抬头
 * （`UMH-05` 的注入器），整份重写会把抬头抹掉、失败注入就测不到任何东西。
 *
 * @returns {{text:string, changed:boolean}}
 */
function editList(generatorText, id, mode) {
  const list = listLiteral(generatorText)
  if (list === null) throw new Error('生成器里读不出 `HOST_LEVEL_IDS = … [ … ]` 这一个字面量')
  const at = list.items.findIndex((item) => plainScalar(item) === id)
  if (mode === 'apply' && at < 0) return { text: generatorText, changed: false }
  if (mode === 'restore' && at >= 0) return { text: generatorText, changed: false }
  const items = mode === 'apply'
    ? list.items.filter((_, index) => index !== at)
    : [...list.items, `'${id}'`]
  const text = `${String(generatorText).slice(0, list.index)}${list.prefix}${items.join(', ')}]`
    + String(generatorText).slice(list.index + list.length)
  return { text, changed: true }
}

// ── 落点：只读生成器写出来的补丁文本（第二个读数，判据那边以补丁为准）──────────
/**
 * `row_landing` 的口径：补丁里 `id === <id>` 的行，`placement === 'insert'` 几条、
 * `in_preset_body === true` 几条。
 *
 * 判据的权威读法是 `tests/agenia-upgrade/support/client-ui-placement.mjs::describePlacement()`
 * （YAML 子树判位置）；这里是一个窄口径的行扫描器，只回答这两个数，产品工具不 import 测试支持。
 * 结构按生成器写出来的形状：顶层 `- insert:` 的直接成员是 4 格，预设体是 10 格。
 *
 * @returns {{insert:number, preset_bodies:number}}
 */
function rowLanding(patchText, id) {
  const lines = String(patchText).replace(/\r\n/g, '\n').split('\n')
  let topInsert = false
  let preset = null
  let insert = 0
  let presetBodies = 0
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (/^- insert:\s*(?:#.*)?$/.test(line)) { topInsert = true; preset = null; continue }
    if (/^- /.test(line)) { topInsert = false; preset = null; continue }
    const item = /^([ ]*)- (.*)$/.exec(line)
    if (item === null) continue
    const indent = item[1].length
    if (indent < 4) continue
    const isTopMember = indent === 4 && topInsert
    if (isTopMember) preset = null
    const idRaw = /^id:\s*(.+?)\s*$/.exec(item[2])?.[1] ?? null
    if (idRaw === null) continue
    const rowId = plainScalar(idRaw)
    // 行体：到下一个缩进 <= 本行的 `- ` 项为止（空行 / 注释跟着走）
    let end = i + 1
    while (end < lines.length) {
      const next = lines[end]
      if (next.trim() === '' || /^\s*#/.test(next)) { end += 1; continue }
      if (indentOf(next) <= indent) break
      end += 1
    }
    let name = null
    for (let j = i + 1; j < end; j += 1) {
      if (indentOf(lines[j]) !== indent + 2) continue
      const hit = new RegExp(`^ {${indent + 2}}name:\\s*(.+?)\\s*$`).exec(lines[j])
      if (hit !== null) { name = plainScalar(hit[1]); break }
    }
    if (isTopMember) preset = name === REGISTRATION_NAME ? rowId : null
    const placement = isTopMember ? 'insert' : indent > 4 ? (preset === null ? 'insert-nested' : 'preset-body') : 'other'
    if (rowId !== id) continue
    if (placement === 'insert') insert += 1
    else if (placement === 'preset-body') presetBodies += 1
  }
  return { insert, preset_bodies: presetBodies }
}

// ── 输出 ──────────────────────────────────────────────────────────────────
/** stdout 恰好一行 JSON；人话走 stderr。 */
function emit({ action, id, repo, code, changed, row_landing = null, carrier = null, failed_step = null, rolled_back = false }, exit, human = null) {
  process.stdout.write(`${JSON.stringify({
    schema: 1,
    action,
    id,
    repo,
    code,
    changed,
    row_landing,
    carrier,
    failed_step,
    rolled_back,
  })}\n`)
  if (human !== null) process.stderr.write(`${human}\n`)
  return exit
}

const head = (text, max = 900) => String(text ?? '').trim().split(/\r?\n/).slice(0, 6).join('\n').slice(0, max)

function usage(code, message, { action = null, id = null, repo = null }) {
  return emit({ action, id, repo, code, changed: 0 }, EXIT.USAGE, `${code} ${message}`)
}

// ── 主流程 ────────────────────────────────────────────────────────────────
function main() {
  const args = parseArgv(process.argv.slice(2))
  if (args.errors.length > 0) return usage('E_UNMOUNT_USAGE', args.errors.join('；'), args)
  if (args.mode === null) return usage('E_UNMOUNT_USAGE', '必须给 --apply 或 --restore（二选一）', args)
  if (args.repo === null) return usage('E_UNMOUNT_USAGE', '必须给 --repo <root>', args)
  if (args.id === null || args.id.trim() === '') return usage('E_UNMOUNT_USAGE', '必须给 --id <row id>', args)

  const id = args.id
  const repo = path.resolve(args.repo)
  const out = { action: args.mode, id, repo }
  const abs = {
    composition: path.join(repo, REL.composition),
    generator: path.join(repo, REL.generator),
    patch: path.join(repo, REL.patch),
  }
  if (!existsSync(repo) || !statSync(repo).isDirectory()) {
    return usage('E_UNMOUNT_REPO_MISSING', `--repo 指到的目录不存在：${repo}`, out)
  }
  for (const key of ['generator', 'composition']) {
    if (!existsSync(abs[key])) return usage('E_UNMOUNT_REPO_INVALID', `这棵树里缺 ${REL[key]}（${abs[key]}）`, out)
  }

  const base = {
    compositionText: readFileSync(abs.composition, 'utf8'),
    generatorText: readFileSync(abs.generator, 'utf8'),
  }
  const carrier = readCarriers({ ...base, id })
  if (!carrier.row_found) {
    return usage('E_UNMOUNT_UNKNOWN_ID', `组合里根本没有 \`- id: ${id}\` 这一行 —— 不许静默当 no-op`, out)
  }
  if (!carrier.list_found) {
    return usage('E_UNMOUNT_LIST_UNREADABLE', `生成器里读不出 \`HOST_LEVEL_IDS = … [ … ]\` 这一个字面量`, out)
  }

  const verdict = classify(carrier)
  if (verdict.state === undefined) {
    return emit({
      ...out,
      code: verdict.code,
      changed: 0,
      carrier: verdict.carrier,
    }, EXIT.REFUSED, `${verdict.code} 入口态不是规范态（载体 ${verdict.carrier} 不在位）；`
      + '没有写任何字节，也没有调用生成器。')
  }

  // 入口已经是这一步的目标态 ⇒ no-op。**不写、不跑生成器**；落点读盘上那份补丁（第二个读数）。
  const target = args.mode === 'apply' ? 'U' : 'M'
  if (verdict.state === target) {
    if (!existsSync(abs.patch)) {
      return usage('E_UNMOUNT_PATCH_MISSING', `入口已经是目标态，但补丁文件不在：${abs.patch} —— 落点判不了`, out)
    }
    const landing = rowLanding(readFileSync(abs.patch, 'utf8'), id)
    return emit({ ...out, code: 'UMH-NOOP', changed: 0, row_landing: landing }, EXIT.OK,
      `UMH-NOOP 入口已经是 --${args.mode} 的目标态；没有写任何字节（落点 ${JSON.stringify(landing)}）。`)
  }

  // ① 三处改动先在内存里算好：任何一处算不出来 ⇒ 还没写就失败。
  let compositionEdit
  let listEdit
  try {
    compositionEdit = editComposition({ carrier, id, mode: args.mode })
    listEdit = editList(base.generatorText, id, args.mode)
  } catch (err) {
    return emit({ ...out, code: 'E_UNMOUNT_STEP_FAILED', changed: 0, failed_step: 'marker', rolled_back: true },
      EXIT.FAILED, `E_UNMOUNT_STEP_FAILED 还没写盘就失败了（载体文本改不动）：${head(err?.message ?? err)}`)
  }

  // 回滚账：两份载体文件 + 补丁（补丁是派生物，失败时一起回，别留下与载体对不上的字节）。
  const snapshot = {
    composition: readFileSync(abs.composition),
    generator: readFileSync(abs.generator),
    patch: existsSync(abs.patch) ? readFileSync(abs.patch) : null,
  }
  const rollback = (failedStep, detail) => {
    let ok = false
    let why = ''
    try {
      writeFileSync(abs.composition, snapshot.composition)
      writeFileSync(abs.generator, snapshot.generator)
      if (snapshot.patch === null) {
        if (existsSync(abs.patch)) unlinkSync(abs.patch)
      } else {
        writeFileSync(abs.patch, snapshot.patch)
      }
      ok = readFileSync(abs.composition).equals(snapshot.composition)
        && readFileSync(abs.generator).equals(snapshot.generator)
        && (snapshot.patch === null ? !existsSync(abs.patch) : readFileSync(abs.patch).equals(snapshot.patch))
    } catch (err) {
      ok = false
      why = `；回滚本身失败：${String(err?.message ?? err)}`
    }
    return emit({ ...out, code: 'E_UNMOUNT_STEP_FAILED', changed: 0, failed_step: failedStep, rolled_back: ok },
      EXIT.FAILED, `E_UNMOUNT_STEP_FAILED 失败步骤 ${failedStep}：${detail}${why}`
        + `（${ok ? '三份文件已逐字节回到跑之前' : '回滚没做到逐字节 — 立刻人工看'}）`)
  }

  // ② 写载体。写失败也走同一条回滚（此时可能一份都没变，回滚是幂等的）。
  try {
    writeFileSync(abs.composition, compositionEdit.text, 'utf8')
    writeFileSync(abs.generator, listEdit.text, 'utf8')
  } catch (err) {
    return rollback('generator', `写载体文件失败：${String(err?.message ?? err)}`)
  }

  // ③ 就地跑生成器（不 import：它加载即 build() + writeFileSync）。
  const gen = spawnSync(process.execPath, [abs.generator], {
    cwd: repo,
    encoding: 'utf8',
    timeout: 180000,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (gen.error !== undefined || gen.status !== 0) {
    return rollback('generator', `生成器 exit=${gen.status}${gen.signal ? ` signal=${gen.signal}` : ''}`
      + `：${head(gen.stderr) || head(gen.stdout) || String(gen.error ?? '')}`)
  }

  // ④ 自证落点：只认生成器写出来的那份补丁文本。
  if (!existsSync(abs.patch)) return rollback('verify', `生成器 exit 0，但补丁文件不在：${abs.patch}`)
  const landing = rowLanding(readFileSync(abs.patch, 'utf8'), id)
  const want = args.mode === 'apply'
    ? { insert: 0, preset_bodies: 2 }
    : { insert: 1, preset_bodies: 0 }
  if (landing.insert !== want.insert || landing.preset_bodies !== want.preset_bodies) {
    return rollback('verify', `落点没翻面：补丁文本读出 ${JSON.stringify(landing)}，期望 ${JSON.stringify(want)}`)
  }

  const changed = Number(compositionEdit.changed.marker)
    + Number(compositionEdit.changed.disabled)
    + Number(listEdit.changed)
  return emit({
    ...out,
    code: args.mode === 'apply' ? 'UMH-APPLIED' : 'UMH-RESTORED',
    changed,
    row_landing: landing,
  }, EXIT.OK, `${args.mode === 'apply' ? 'UMH-APPLIED' : 'UMH-RESTORED'} 三处载体已改，`
    + `生成器 exit 0，落点 ${JSON.stringify(landing)}。`)
}

process.exit(main())
