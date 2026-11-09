/**
 * `SMT-01` —— 记忆轮转的**一轮**：F3 配比 · F4 写盘闸 · F5 换版归零（Gate 2 · 评审 r3 的 `R4-a`）。
 *
 * 契约：`.team/test/2026-11-09/CONTRACT-f11-judge-kind.md` §4。
 * 被测：staged `inject.js` 的模块级导出 `memoryRotationRoundOf`（`inject.js:2666`）
 *      + staged `lib/memory-rotation.mjs`（纯逻辑；由用例作为参数传进去）。
 *
 * ## 为什么是"一格三条腿"（不新开三个 ID）
 * F3 / F4 / F5 是**同一个函数、同一轮**的三个事实：怎么配比 / 什么时候写游标 / 换版从哪起。
 * 它们共用同一份夹具形状（一个临时数据根 + 一份合成快照），单开三格会把"这一轮到底跑没跑起来"
 * 抄三遍、把同一具夹具建三次，而**红码各有一条**（`SMT-F3-*` / `SMT-F4-*` / `SMT-F5-*`），
 * 红的时候照样一眼看得出是哪一条。R4 的验收原话是"补断言"，不是"按 F 编号拆格"。
 *
 * ## 三条腿各判什么
 *   · **F3**：项目池 2 条 + 通用 24 条，连续三轮 ⇒ 每轮项目取 1 条、**相邻两轮不重复**：
 *         项目 id 恰好 `p-001` / `p-002` / `p-001`（断言 **id 序列**，不是条数），项目游标 `0→1→0`。
 *         池 2 条时名额若取 2 ⇒ `(0+2)%2 = 0`，相邻两轮贴同一批 —— 那正是这条腿要红的样子。
 *   · **F4**：快照读不到 / 池子空 ⇒ `cursor_written:false` **且盘上没有游标文件**；
 *         池子空但**已有**游标文件 ⇒ 那份文件**逐字节不变**（写一个"没有游标键的文件"也不行）。
 *         阳性对照：正常一轮**必须**写（否则"永不写"会在这一腿上假绿）。
 *   · **F5**：盘上 `snapshot:'v26'`、游标 5，这一轮 `v27` ⇒ `reset:true` + **出声**
 *         （`say` 收到 `rotation-snapshot-changed`，报文点名 `v26` 与 `v27`）
 *         + 游标从 0 起（落 `9`，**不是** `5+9=14`）+ 正文贴的是 `g-001`（第 0 条）而不是 `g-006`（第 5 条）。
 *
 * ## 三把刀（各只切一处；锚点恰好 1 处；只切副本）
 *   · `K3` 切 `lib/memory-rotation.mjs` 的 `projectTake`（回到 `min(2, 池长)`）⇒ **只翻 F3**；
 *   · `K4` 切 `inject.js` 的写盘闸（`note === 'ok' && moved` ⇒ `note !== 'ok' || moved`）⇒ **只翻 F4**；
 *   · `K5` 切 `inject.js` 的 reset（恒 `false`）⇒ **只翻 F5**。
 *   每一刀都把三条腿整段重跑，翻面集必须与期望**精确相等**（多翻 = 刀切宽了 / 少翻 = 那一面没人守）。
 *   为什么刀切副本而不是产品：产品这四个面今天已实现（`bd3a7d6`）⇒ 产品面今天是绿的，
 *   判据的**可翻面性**只能由刀承重（同 `OFL-06` / `JUD-02` 的规矩：`presets/**` 零字节）。
 *
 * ## 出声面（F5 的可观测性）
 * `memoryRotationRoundOf({ …, say })` 的第 5 个参数**就是**产品的出声通道（`apply()` 里传的是
 * `warnOnce`，`inject.js:3750`）。判据**不需要产品改一行**就能读到它：喂一个记录器，断言键名与报文里
 * 的两个版本。若将来产品把 `say` 从签名里拿掉 ⇒ 本格红在 `SMT-F5-RESET`，报文点名"出声面不可观测"。
 *
 * ## 边界（这一格**不**判什么）
 *   · 不判 `apply()` 那条路的接线（`agent/pre-step` / `tailBodyOf` 的段序由 `BRD-01` 一族守着）；
 *   · 不判共享记忆库的真快照（真 `.runtime/` 一个字节都不碰；夹具是合成快照）；
 *   · 不判轮转正文的措辞（只判"从第几条起"这件事，用 id 认，不用文案认）。
 */
import { before, describe, test } from 'node:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { caseDir, caseFail, caseHold, preflight, problem, runCase } from '../support/evidence.mjs'
import { importStaged, readStagedText } from '../support/sut.mjs'
import { importSourceCopy, knifeReplace } from '../support/injector-harness.mjs'

before(() => { preflight() })

/** 项目名：`projectNameOf(E:\Harness)` = `Harness`；条目正文里点名它才会进项目池。 */
const PROJECT = 'Harness'
/** 通用条目（24 条 ⇒ 名额 10 里去掉 1 条项目后取 9 条，游标会动）。 */
const generalEntries = (n = 24) => Array.from({ length: n }, (_, i) => ({
  id: `g-${String(i + 1).padStart(3, '0')}`,
  type: 'general',
  text: `通用条目 ${i + 1}`,
}))
/** 本项目条目（正文点名 `Harness` —— 快照里没有 `project` 字段，靠正文认，见 `memory-rotation.mjs` 模块头）。 */
const projectEntries = (n = 2) => Array.from({ length: n }, (_, i) => ({
  id: `p-00${i + 1}`,
  type: 'project',
  text: `Harness 这个项目的第 ${i + 1} 条`,
}))
/** 形状照 `currentSnapshotOf` 的返回值（`version` 是 `v<n>`；`file` 只给人读）。 */
const snapOf = (version, entries) => ({ version, file: `(fixture)/${version}.json`, entries })

/** 一条"一轮"的读数（缺导出 / 抛异常都折成红因，不落成"文件找不到"）。 */
function roundOf(mod, args) {
  if (typeof mod?.memoryRotationRoundOf !== 'function') {
    return { ok: false, code: 'SMT-SURFACE-MISSING', why: 'staged `inject.js` 没有导出 `memoryRotationRoundOf` —— R4 的可驱动面不存在', value: null }
  }
  try {
    return { ok: true, code: null, why: null, value: mod.memoryRotationRoundOf(args) }
  } catch (err) {
    return { ok: false, code: 'SMT-ROUND-THREW', why: `${err?.code ?? 'THROWN'}: ${String(err?.message ?? err)}`, value: null }
  }
}

/** 游标文件落点（产品给的 `CURSOR_REL` 是唯一来源）。 */
function cursorFileOf(root, rotation) {
  return path.join(root, ...rotation.CURSOR_REL)
}

/** 游标文件的**内容**（没有 / 坏 JSON ⇒ `null`；形状问题由调用方判）。 */
function readCursor(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null }
}

/** 游标文件的**字节**（"不许重写"那条量的是字节，不是"读过文件"）。 */
function readBytes(file) {
  try { return readFileSync(file, 'utf8') } catch { return null }
}

/** 一段轮转正文里被挑中的 id（正文每一行形如 `- \`g-001\` · …`）。 */
function pickedIdsOf(text) {
  return String(text ?? '').split('\n')
    .map((line) => /^- `([^`]+)`/.exec(line))
    .filter((hit) => hit !== null)
    .map((hit) => hit[1])
}

/** 这一跑专属的一个空数据根（`mkdtempSync` ⇒ 同一次运行里重跑也不会撞到上一轮的文件）。 */
function freshRoot(label) {
  const base = path.join(caseDir('SMT-01'), 'roots')
  mkdirSync(base, { recursive: true })
  return mkdtempSync(path.join(base, `${label}-`))
}

// ─────────────────────────────────────────────────────────────────────────────
// 三条腿 —— 同一段断言喂给**产品**与每一把**刀**（刀只切副本）
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {{mod:object, rotation:object}} subject 被测模块（产品 / 刀切过的副本）
 * @param {string} tag 这一跑的名字（也是临时目录的前缀）
 * @returns {{problems:Array<{code:string,message:string}>, readings:object}}
 */
function facesOf({ mod, rotation }, tag) {
  const problems = []
  const readings = {}
  const push = (code, message) => problems.push(problem(code, message))

  // ── F3 · 项目池 2 条 · 连续三轮 ─────────────────────────────────────────
  {
    const root = freshRoot(`${tag}-f3`)
    const snapshot = snapOf('v1', [...generalEntries(24), ...projectEntries(2)])
    const rounds = []
    for (let i = 0; i < 3; i += 1) {
      const file = cursorFileOf(root, rotation)
      const before = readCursor(file)
      const res = roundOf(mod, { root, project: PROJECT, snapshot, rotation, say: () => {} })
      const after = readCursor(file)
      if (!res.ok) {
        push(res.code, `F3：第 ${i + 1} 轮没跑起来（${res.why}）—— 这一条判不了，**不是通过**`)
        break
      }
      rounds.push({
        round: i + 1,
        note: res.value?.note,
        cursor_written: res.value?.cursor_written,
        picked: pickedIdsOf(res.value?.text),
        cursor_before: before,
        cursor_after: after,
      })
    }
    readings.F3 = rounds
    if (rounds.length === 3) {
      const projectPicked = rounds.map((row) => row.picked.filter((id) => id.startsWith('p-')))
      if (JSON.stringify(projectPicked) !== JSON.stringify([['p-001'], ['p-002'], ['p-001']])) {
        push('SMT-F3-ROTATION', `F3：项目池 2 条时三轮应各取 1 条且交替（p-001 / p-002 / p-001），实得 ${JSON.stringify(projectPicked)} —— 名额取 2 会让 (0+2)%2=0，相邻两轮贴同一批`)
      }
      for (let i = 0; i < 2; i += 1) {
        const a = rounds[i].picked.join(',')
        const b = rounds[i + 1].picked.join(',')
        if (a === b || a === '' || b === '') {
          push('SMT-F3-ROTATION', `F3：第 ${i + 1} 轮与第 ${i + 2} 轮挑中的 id 完全相同（${JSON.stringify(rounds[i].picked)}）—— 相邻两轮不许重叠；或某一轮一条都没挑到`)
        }
      }
      const projectCursors = rounds.map((row) => row.cursor_after?.cursor_project ?? null)
      if (JSON.stringify(projectCursors) !== JSON.stringify([1, 0, 1])) {
        push('SMT-F3-ROTATION', `F3：项目游标应 0→1→0（落盘值 1 / 0 / 1），实得 ${JSON.stringify(projectCursors)}（每轮 before=${JSON.stringify(rounds.map((r) => r.cursor_before?.cursor_project ?? null))}）`)
      }
      for (const row of rounds) {
        if (row.note !== 'ok') push('SMT-F3-ROTATION', `F3：第 ${row.round} 轮 note 应为 \`ok\`（池子非空），实得 ${JSON.stringify(row.note)}`)
        if (row.cursor_written !== true) push('SMT-F3-ROTATION', `F3：第 ${row.round} 轮游标必须落盘（游标动了），实得 cursor_written=${JSON.stringify(row.cursor_written)}`)
      }
    }
  }

  // ── F4 · 写游标的闸（note 必须 `ok`；盘上不许出现"零游标"的文件）──────────
  {
    const F4 = (readings.F4 = {})

    // 阳性对照：正常一轮**必须**写（否则"永不写"会在这一腿上假绿）。
    // 池子用 24 通用 + 1 项目：`projectTake` 在 1 条时恒为 1 ⇒ 这条腿与 F3 那把刀无关。
    {
      const root = freshRoot(`${tag}-f4-ok`)
      const res = roundOf(mod, { root, project: PROJECT, snapshot: snapOf('v1', [...generalEntries(24), ...projectEntries(1)]), rotation, say: () => {} })
      const cursor = readCursor(cursorFileOf(root, rotation))
      F4.control = { ok: res.ok, note: res.value?.note ?? null, cursor_written: res.value?.cursor_written ?? null, cursor }
      if (!res.ok) push(res.code, `F4 阳性对照：正常一轮没跑起来（${res.why}）`)
      else {
        if (res.value?.note !== 'ok') push('SMT-F4-CONTROL', `F4 阳性对照：池子非空 ⇒ note 应为 \`ok\`，实得 ${JSON.stringify(res.value?.note)}`)
        if (res.value?.cursor_written !== true) push('SMT-F4-CONTROL', `F4 阳性对照：游标动了就必须落盘，实得 cursor_written=${JSON.stringify(res.value?.cursor_written)}（"永不写"不是通过，是这一整条闸失效）`)
        if (cursor?.cursor_general !== 9) push('SMT-F4-CONTROL', `F4 阳性对照：24 通用 + 1 项目 ⇒ 本轮取 9 条通用，落盘游标应为 9，实得 ${JSON.stringify(cursor)}`)
      }
    }

    // ① 快照读不到 ⇒ 不写、盘上没有游标文件。
    {
      const root = freshRoot(`${tag}-f4-unreadable`)
      const res = roundOf(mod, { root, project: PROJECT, snapshot: undefined, rotation, say: () => {} })
      const file = cursorFileOf(root, rotation)
      F4.unreadable = { ok: res.ok, note: res.value?.note ?? null, cursor_written: res.value?.cursor_written ?? null, file_exists: existsSync(file) }
      if (!res.ok) push(res.code, `F4：快照读不到那一轮没跑起来（${res.why}）`)
      else {
        if (res.value?.note !== 'snapshot-unavailable') push('SMT-F4-NO-CURSOR', `F4：快照读不到 ⇒ note 应为 \`snapshot-unavailable\`，实得 ${JSON.stringify(res.value?.note)}`)
        if (res.value?.cursor_written !== false) push('SMT-F4-NO-CURSOR', `F4：快照读不到 ⇒ \`cursor_written\` 必须 false，实得 ${JSON.stringify(res.value?.cursor_written)}`)
        if (existsSync(file)) push('SMT-F4-NO-CURSOR', `F4：快照读不到却在盘上写了游标文件（${file}）—— 写一个\`零游标\`的文件也算写`)
      }
    }

    // ② 池子空 ⇒ 不写、盘上没有游标文件。
    {
      const root = freshRoot(`${tag}-f4-empty`)
      const res = roundOf(mod, { root, project: PROJECT, snapshot: snapOf('v1', [{ id: 'b-001', type: 'boss', text: '关于老板的一条' }]), rotation, say: () => {} })
      const file = cursorFileOf(root, rotation)
      F4.empty_pool = { ok: res.ok, note: res.value?.note ?? null, cursor_written: res.value?.cursor_written ?? null, file_exists: existsSync(file) }
      if (!res.ok) push(res.code, `F4：空池那一轮没跑起来（${res.why}）`)
      else {
        if (res.value?.note !== 'empty-pool') push('SMT-F4-NO-CURSOR', `F4：池子空 ⇒ note 应为 \`empty-pool\`，实得 ${JSON.stringify(res.value?.note)}`)
        if (res.value?.cursor_written !== false) push('SMT-F4-NO-CURSOR', `F4：池子空 ⇒ \`cursor_written\` 必须 false，实得 ${JSON.stringify(res.value?.cursor_written)}`)
        if (existsSync(file)) push('SMT-F4-NO-CURSOR', `F4：池子空却在盘上写了游标文件（${file}）`)
      }
    }

    // ③ 池子空但**已有**游标文件 ⇒ 那份文件逐字节不变（"不写"不许把旧游标改写成 0）。
    {
      const root = freshRoot(`${tag}-f4-keep`)
      const file = cursorFileOf(root, rotation)
      mkdirSync(path.dirname(file), { recursive: true })
      const seeded = `${JSON.stringify({ cursor_general: 3, cursor_project: 0, snapshot: 'v1', updated_at: '2026-11-01T00:00:00.000Z' })}\n`
      writeFileSync(file, seeded, 'utf8')
      const res = roundOf(mod, { root, project: PROJECT, snapshot: snapOf('v1', [{ id: 'b-001', type: 'boss', text: '关于老板的一条' }]), rotation, say: () => {} })
      const after = readBytes(file)
      F4.empty_pool_seeded = { ok: res.ok, note: res.value?.note ?? null, cursor_written: res.value?.cursor_written ?? null, bytes_same: after === seeded }
      if (!res.ok) push(res.code, `F4：空池 + 已有游标那一轮没跑起来（${res.why}）`)
      else {
        if (res.value?.note !== 'empty-pool') push('SMT-F4-NO-CURSOR', `F4：空池 + 已有游标 ⇒ note 仍应为 \`empty-pool\`，实得 ${JSON.stringify(res.value?.note)}`)
        if (res.value?.cursor_written !== false) push('SMT-F4-NO-CURSOR', `F4：空池 + 已有游标 ⇒ \`cursor_written\` 必须 false，实得 ${JSON.stringify(res.value?.cursor_written)}`)
        if (after !== seeded) push('SMT-F4-NO-CURSOR', `F4：空池 + 已有游标 ⇒ 那份文件必须逐字节不变（不写不等于重写成 0），实得 ${JSON.stringify(after)?.slice(0, 160)}`)
      }
    }
  }

  // ── F5 · 换快照版本 ⇒ 游标从 0 重来 + 出声 ───────────────────────────────
  {
    const root = freshRoot(`${tag}-f5`)
    const file = cursorFileOf(root, rotation)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, `${JSON.stringify({ cursor_general: 5, cursor_project: 1, snapshot: 'v26' })}\n`, 'utf8')
    const said = []
    const say = (key, message) => said.push({ key, message })
    // 24 通用 + 1 项目：`projectTake` 恒为 1 ⇒ 这一腿与 F3 那把刀无关。
    const res = roundOf(mod, { root, project: PROJECT, snapshot: snapOf('v27', [...generalEntries(24), ...projectEntries(1)]), rotation, say })
    const cursor = readCursor(file)
    const text = String(res.value?.text ?? '')
    const hit = said.find((row) => row.key === 'rotation-snapshot-changed')
    readings.F5 = {
      ok: res.ok,
      reset: res.value?.reset ?? null,
      cursor_written: res.value?.cursor_written ?? null,
      cursor,
      said: said.map((row) => row.key),
      picked: pickedIdsOf(text),
    }
    if (!res.ok) push(res.code, `F5：换版那一轮没跑起来（${res.why}）`)
    else {
      if (res.value?.reset !== true) push('SMT-F5-RESET', `F5：盘上 snapshot=v26、这一轮 v27 ⇒ \`reset\` 必须 true，实得 ${JSON.stringify(res.value?.reset)}`)
      if (cursor?.cursor_general !== 9 || cursor?.cursor_project !== 0) {
        push('SMT-F5-RESET', `F5：换版后游标必须从 0 起（24 通用 + 1 项目 ⇒ 落 cursor_general 9 / cursor_project 0），实得 ${JSON.stringify(cursor)} —— 5+9=14 就是"没归零"`)
      }
      if (hit === undefined) {
        push('SMT-F5-RESET', 'F5：换版必须出声，但 `say` 没收到 `rotation-snapshot-changed` —— 出声面不可观测（产品导出签名里的 `say` 还是不是那个通道？）')
      } else if (!String(hit.message).includes('v26') || !String(hit.message).includes('v27')) {
        push('SMT-F5-RESET', `F5：换版那一句必须点名两个版本（v26 → v27），实得 ${JSON.stringify(String(hit.message).slice(0, 200))}`)
      }
      if (!text.includes('`g-001`')) push('SMT-F5-RESET', `F5：换版后正文应从第 0 条起（应含 \`g-001\`），实得挑中 ${JSON.stringify(pickedIdsOf(text))}`)
      if (text.includes('`g-014`')) push('SMT-F5-RESET', `F5：正文含 \`g-014\`（第 5 条起的第 9 条）—— 游标没有归零，仍从旧序号接着走；本应从 0 起只贴到 \`g-009\``)
    }
  }

  return { problems, readings }
}

// ─────────────────────────────────────────────────────────────────────────────
// 三把刀（只切副本；锚点恰好 1 处）
// ─────────────────────────────────────────────────────────────────────────────
const KNIVES = [
  {
    id: 'K3',
    label: 'projectTake 回到 min(2, 池长)（池 2 条时恒取 2）',
    // 切的是纯逻辑模块（用例把它作为 `rotation` 参数喂给产品函数）⇒ 只影响 F3 那条腿。
    file: path.join('lib', 'memory-rotation.mjs'),
    find: 'const projectTake = Math.min(PROJECT_SLOTS, Math.max(1, pool.project.length - 1))',
    replace: 'const projectTake = Math.min(PROJECT_SLOTS, pool.project.length)',
    want: ['SMT-F3-ROTATION'],
  },
  {
    id: 'K4',
    label: '写盘闸退回"只要 note 不是 ok 也写"',
    file: 'inject.js',
    find: "if (block.note === 'ok' && moved)",
    replace: "if (block.note !== 'ok' || moved)",
    want: ['SMT-F4-NO-CURSOR'],
  },
  {
    id: 'K5',
    label: '换版 reset 恒 false',
    file: 'inject.js',
    find: 'const reset = snapWas !== null && snapNow !== null && snapWas !== snapNow',
    replace: 'const reset = false',
    want: ['SMT-F5-RESET'],
  },
]

describe('unit · memory rotation (SMT) · R4 (F3 / F4 / F5)', () => {
  test('SMT-01 记忆轮转的一轮：项目池 2 条三轮交替（p-001/p-002/p-001，游标 0→1→0）· 快照读不到/池子空一律不写游标（盘上零文件、已有文件逐字节不变）· 换版 reset + 出声 + 从 0 起；三把刀各只翻自己那一条腿', async () => {
    await runCase('SMT-01', async (rec) => {
      const out = []
      const push = (code, message) => out.push(problem(code, message))

      // ── 被测面：staged 的两个导出（缺面 ⇒ 红，不是"文件找不到"）────────────
      let mod = null
      let rotation = null
      try {
        mod = await importStaged('inject.js')
      } catch (err) {
        push(err?.code ?? 'SMT-SURFACE-MISSING', `staged \`inject.js\` 载不进来：${String(err?.message ?? err).slice(0, 240)}`)
      }
      try {
        rotation = await importStaged(path.join('lib', 'memory-rotation.mjs'))
      } catch (err) {
        push(err?.code ?? 'SMT-SURFACE-MISSING', `staged \`lib/memory-rotation.mjs\` 载不进来：${String(err?.message ?? err).slice(0, 240)}`)
      }
      if (mod !== null && typeof mod.memoryRotationRoundOf !== 'function') {
        push('SMT-SURFACE-MISSING', '`inject.js` 没有导出 `memoryRotationRoundOf` —— 这一格没有可驱动的面（R4 的验收前提）')
      }
      if (rotation !== null) {
        if (typeof rotation.rotationBlockOf !== 'function') push('SMT-SURFACE-MISSING', '`lib/memory-rotation.mjs` 没有导出 `rotationBlockOf`')
        if (!Array.isArray(rotation.CURSOR_REL) || rotation.CURSOR_REL.length === 0) push('SMT-SURFACE-MISSING', '`lib/memory-rotation.mjs` 没有导出非空的 `CURSOR_REL`（游标落点没有唯一来源）')
      }
      if (out.length > 0) {
        rec.readings.surface = { inject: mod === null ? 'missing' : 'loaded', rotation: rotation === null ? 'missing' : 'loaded' }
        caseFail(out)
        return
      }

      // ── 产品面：三条腿 ────────────────────────────────────────────────────
      let product
      try {
        product = facesOf({ mod, rotation }, 'product')
      } catch (err) {
        // 夹具建不出来（mkdtemp 失败等）⇒ HOLD + 点名，不是红（同 `OFL-07` 的 `SMT-FIXTURE` 口径）。
        caseHold(rec, 'SMT-FIXTURE-MISSING', `临时数据根建不出来：${String(err?.message ?? err).slice(0, 240)}`)
        return
      }
      rec.readings.product = product.readings
      rec.readings.product_problem_codes = product.problems.map((p) => p.code)
      out.push(...product.problems)

      // ── 三把刀：每把只许翻它那一条腿（精确集合）───────────────────────────
      const knives = (rec.readings.knives = {})
      for (const knife of KNIVES) {
        const dir = path.join(caseDir('SMT-01'), 'knives', knife.id)
        const entry = (knives[knife.id] = { label: knife.label, file: knife.file, anchor_ok: false, import_ok: false, codes: [], want: knife.want })
        const cut = knifeReplace({ source: readStagedText(knife.file), find: knife.find, replace: knife.replace })
        entry.anchor_ok = cut.ok
        entry.anchor_code = cut.code
        entry.anchor_why = cut.why
        if (!cut.ok) {
          push('SMT-KNIFE-ANCHOR', `${knife.id}（${knife.label}）在 \`${knife.file}\` 上没有落点：${cut.code} ${cut.why} —— 尺子坏了，不许当成"刀咬了"`)
          continue
        }
        const loaded = await importSourceCopy({ dir, source: cut.source, name: knife.id === 'K3' ? 'memory-rotation.knife.mjs' : `inject-${knife.id}.mjs` })
        entry.import_ok = loaded.ok === true
        if (!loaded.ok) {
          entry.import_code = loaded.code
          entry.import_why = loaded.why
          push('SMT-KNIFE-IMPORT', `${knife.id} 切过的副本载不进来：${loaded.code} ${loaded.why}`)
          continue
        }
        let knifeFaces
        try {
          knifeFaces = knife.id === 'K3'
            ? facesOf({ mod, rotation: loaded.mod }, `knife-${knife.id}`)
            : facesOf({ mod: loaded.mod, rotation }, `knife-${knife.id}`)
        } catch (err) {
          push('SMT-KNIFE-IMPORT', `${knife.id} 的三条腿跑不起来：${String(err?.message ?? err).slice(0, 240)}`)
          continue
        }
        const codes = [...new Set(knifeFaces.problems.map((p) => p.code))].sort()
        entry.codes = codes
        entry.readings = knifeFaces.readings
        if (JSON.stringify(codes) !== JSON.stringify([...knife.want].sort())) {
          push('SMT-KNIFE-VECTOR', `${knife.id}（${knife.label}）翻面集与期望不同：实测 ${JSON.stringify(codes)}，期望 ${JSON.stringify(knife.want)} —— 多翻 = 刀切宽了，少翻 = 那一面没人守`)
        }
      }

      rec.readings.summary = {
        F3_green: !product.problems.some((p) => p.code.startsWith('SMT-F3')),
        F4_green: !product.problems.some((p) => p.code.startsWith('SMT-F4')),
        F5_green: !product.problems.some((p) => p.code.startsWith('SMT-F5')),
        knives: Object.fromEntries(Object.entries(knives).map(([id, row]) => [id, { anchor_ok: row.anchor_ok, codes: row.codes }])),
      }
      caseFail(out)
    })
  })
})
