/**
 * `DEC-09` —— **supersede 的写手**（`决议-check.mjs --op supersede`，契约 §5.6 / §0.3-`D4`）。
 *
 * 为什么单开一格（而不是并进 `DEC-02`）：`DEC-02` 判的是**检查器**的接受/拒绝边界（只读），
 * 这一格判的是**唯一会写盘的那条路**（原子写 / 只翻两个字段 / 五条拒做）。两处坏法完全不同：
 * 检查器坏 = "坏账没被看见"；写手坏 = "它亲手把坏账写下去"。放在同一格里，结算行就说不清是哪一处坏了。
 *
 * 🔴 判据的两条纪律（组长 2026-11-12 的分工，T1）：
 *   ① **正文 sha256 由夹具自己量** —— 不信工具的 `body_sha256` 自报（工具自报可以是"算完就写"的结果）。
 *      `supersedeFlipReading()` 比的是"翻之前 / 翻之后"两份盘上字节：只许两行不同（`状态` / `superseded_by`），
 *      其余每一行逐字相同；`superseded_by` 之后的正文 sha256 必须相同。
 *   ② **每一条拒做一个样本** —— already-retired / same-file / old-missing / new-missing / no-reciprocal
 *      各一个码；拒的时候**一个字节都不许写**。
 *
 * 刀：把写手复制到运行根里、**把"翻旧文状态"那一行改回去**（K1）⇒ 这一格必须红；再把正文闸摘掉、
 * 写的时候少一个换行（K2）⇒ 夹具量到的正文 sha 变了（而工具自报仍是"没变"）。
 * 副本刀不碰生产文件；副本树自带模块闭包（加载期不向仓库要文件）；刀锚点不在 / 闭包不闭合 ⇒ `DEC09-KNIFE-ANCHOR`。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { before, test } from 'node:test'
import { caseFail, preflight, problem, runCase, sha256Text } from '../support/evidence.mjs'
import { PATHS } from '../support/env.mjs'
import {
  CHECK, buildScene, codesOf, expectCodes, goodDecision0001, goodDecisionProduct0001, goodLedger,
  readText, runCheck, runNode, runSupersede, sceneRoot, summarize, supersedeFlipReading, toolPresent,
} from '../support/decision-ledger.mjs'

before(() => {
  preflight()
})

const TOPIC = '决议账本三册制'
const OLD_FILE = '决议/构案/0001-决议账本三册制.md'

/** `0002` 替 `0001` 的那一对（同一主题；INDEX 指向 0002）。 */
function pair({ oldRetired = false, reciprocal = true } = {}) {
  const second = {
    series: '构案',
    id: '0002',
    title: TOPIC,
    header: { 主题: TOPIC, ...(reciprocal ? { supersedes: '0001' } : {}) },
  }
  const first = oldRetired
    ? goodDecision0001({ 状态: '已废', superseded_by: '0002' })
    : goodDecision0001()
  return {
    decisions: [first, second, goodDecisionProduct0001()],
    index: {
      rows: [
        { concept: TOPIC, owner: '组长', census: 2, decision: '0002' },
        { concept: '双写者', owner: '实现岗', census: 1, decision: '—' },
      ],
    },
  }
}

/** 一份夹具 + 一次 supersede 调用；拒绝样本用它。 */
function refusalSample(problems, rec, push, { tag, spec, old, by, wantCode }) {
  const scene = goodLedger({ caseId: 'DEC-09', tag, ...spec })
  const file = path.join(scene.root, OLD_FILE)
  const beforeText = readText(file)
  const run = runSupersede(scene.root, { old, by })
  const afterText = readText(file)
  const entry = {
    exit: run.exit, ok: run.json?.ok ?? null, verdict: run.json?.verdict ?? null,
    code: run.json?.code ?? null, written: run.json?.written ?? null,
    codes: codesOf(run.json),
    bytes_unchanged: beforeText !== null && afterText === beforeText,
    messages: (run.json?.problems ?? []).map((p) => String(p.message).slice(0, 200)),
  }
  rec.readings[tag] = entry
  if (!expectCodes(problems, run, [wantCode], push, { label: `DEC-09/${tag}` })) return
  if (run.json.verdict !== 'refuse') push('SUPERSEDE-VERDICT', `[DEC-09/${tag}] verdict 必须是 \`refuse\`，实得 ${JSON.stringify(run.json.verdict)}`)
  if (run.json.code !== wantCode) push('SUPERSEDE-CODE', `[DEC-09/${tag}] code 必须是 ${JSON.stringify(wantCode)}，实得 ${JSON.stringify(run.json.code)}`)
  if (run.json.written !== false) push('SUPERSEDE-WROTE-ON-REFUSAL', `[DEC-09/${tag}] 拒的时候 \`written\` 必须是 false，实得 ${JSON.stringify(run.json.written)}`)
  if (!entry.bytes_unchanged) push('SUPERSEDE-WROTE-ON-REFUSAL', `[DEC-09/${tag}] 拒的时候旧文**一个字节都不许变**（${OLD_FILE} 变了）`)
}

test('DEC-09 supersede 写手：只翻头块两个字段、正文 sha 不变；五条拒做各一码且零写入；两把副本刀', async () => {
  await runCase('DEC-09', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    const refuse = (args) => { refusalSample(problems, rec, push, args) }
    if (!toolPresent(problems, CHECK, '契约 §5.6 的写手（`--op supersede`）')) {
      caseFail(problems)
      return
    }

    // ── ① 正面：一对 0001 → 0002，翻完旧文两个字段变了、其余逐字不变 ─────────────
    {
      const scene = goodLedger({ caseId: 'DEC-09', tag: 'flip', ...pair() })
      const file = path.join(scene.root, OLD_FILE)
      const beforeText = readText(file)
      const beforeSha = sha256Text(beforeText ?? '')
      const run = runSupersede(scene.root, { old: '0001', by: '0002' })
      const afterText = readText(file)
      const reading = supersedeFlipReading(beforeText, afterText, '0002')
      rec.readings.flip = {
        exit: run.exit, ok: run.json?.ok ?? null, verdict: run.json?.verdict ?? null,
        written: run.json?.written ?? null, codes: codesOf(run.json),
        file_sha256: { before: beforeSha, after: sha256Text(afterText ?? '') },
        tool_self_report: run.json?.body_sha256 ?? null,
        reading,
      }
      if (!expectCodes(problems, run, [], push, { label: 'DEC-09/flip' })) {
        // 写手自己都拒了 ⇒ 后面的字节断言无意义（红因已记）
      } else {
        if (run.json.verdict !== 'pass' || run.json.written !== true) {
          push('SUPERSEDE-NOT-WRITTEN', `[DEC-09/flip] 这一跑必须 \`pass\` 且 \`written: true\`，实得 verdict=${JSON.stringify(run.json.verdict)} written=${JSON.stringify(run.json.written)}`)
        }
        if (!reading.same_length) {
          push('SUPERSEDE-LINES', `[DEC-09/flip] 旧文行数变了（${reading.length_before} → ${reading.length_after}）—— supersede 只许换两行的字，不许增删行`)
        }
        if (reading.diff_count !== 2) {
          push('SUPERSEDE-LINES', `[DEC-09/flip] 只许两行不同（\`状态\` / \`superseded_by\`），实测 ${reading.diff_count} 行不同：${JSON.stringify(reading.diff_lines)}`)
        }
        if (reading.status_line === null || !/^状态\s*[:：]\s*已废\s*$/u.test(reading.status_line)) {
          push('SUPERSEDE-FIELDS', `[DEC-09/flip] \`状态\` 必须翻成 \`已废\`，实得 ${JSON.stringify(reading.status_line)}`)
        }
        if (reading.superseded_by_value !== '0002') {
          push('SUPERSEDE-FIELDS', `[DEC-09/flip] \`superseded_by\` 必须翻成 \`0002\`，实得 ${JSON.stringify(reading.superseded_by_value)}`)
        }
        if (reading.body_sha256.before === null || reading.body_sha256.before !== reading.body_sha256.after) {
          push('SUPERSEDE-BODY-SHA', `[DEC-09/flip] 正文 sha256 变了（${String(reading.body_sha256.before).slice(0, 12)} → `
            + `${String(reading.body_sha256.after).slice(0, 12)}）—— supersede 只许动头块两个字段（契约 §0.3-D3 / §5.6）`)
        }
        // 工具自报与夹具测量必须同值（**断言的是夹具那一侧**；这里只是把自报摆在同一行读数里对照）
        const self = run.json.body_sha256 ?? {}
        if (self.before !== reading.body_sha256.before || self.after !== reading.body_sha256.after) {
          push('SUPERSEDE-SELF-REPORT', `[DEC-09/flip] 工具自报的正文 sha 与夹具量到的不同（自报 ${JSON.stringify(self)} / 夹具 ${JSON.stringify(reading.body_sha256)}）`)
        }
        // 翻完这棵树必须是**一致的**（写手收尾不留坏账）
        const check = runCheck(scene.root)
        rec.readings.flip.check = { exit: check.exit, codes: codesOf(check.json), ok: check.json?.ok ?? null }
        expectCodes(problems, check, [], push, { label: 'DEC-09/flip-check' })
      }
      // `--dry-run`：不许落盘（同一对、另一份夹具）
      const dryScene = goodLedger({ caseId: 'DEC-09', tag: 'dry-run', ...pair() })
      const dryFile = path.join(dryScene.root, OLD_FILE)
      const dryBefore = readText(dryFile)
      const dry = runSupersede(dryScene.root, { old: '0001', by: '0002', extra: ['--dry-run'] })
      const dryAfter = readText(dryFile)
      rec.readings.dry_run = { exit: dry.exit, verdict: dry.json?.verdict ?? null, written: dry.json?.written ?? null, bytes_unchanged: dryBefore === dryAfter }
      if (dry.exit !== 0 || dry.json?.verdict !== 'dry-run' || dry.json?.written !== false) {
        push('SUPERSEDE-DRY-RUN', `[DEC-09/dry-run] \`--dry-run\` 必须 exit 0 / verdict \`dry-run\` / written false，`
          + `实得 exit=${dry.exit} verdict=${JSON.stringify(dry.json?.verdict)} written=${JSON.stringify(dry.json?.written)}`)
      }
      if (dryBefore !== dryAfter) push('SUPERSEDE-DRY-RUN', '[DEC-09/dry-run] `--dry-run` 居然写了盘 —— 演练不是执行')
    }

    // ── ② 五条拒做，每一条一个样本（契约 §5.6 的拒码表）──────────────────────────
    refuse({ tag: 'refuse-already-retired', spec: pair({ oldRetired: true }), old: '0001', by: '0002', wantCode: 'SUPERSEDE-ALREADY-RETIRED' })
    refuse({ tag: 'refuse-same-file', spec: pair(), old: '0001', by: '0001', wantCode: 'SUPERSEDE-SAME-FILE' })
    refuse({ tag: 'refuse-old-missing', spec: pair(), old: '0009', by: '0002', wantCode: 'SUPERSEDE-OLD-MISSING' })
    refuse({ tag: 'refuse-new-missing', spec: pair(), old: '0001', by: '0009', wantCode: 'SUPERSEDE-NEW-MISSING' })
    refuse({ tag: 'refuse-no-reciprocal', spec: pair({ reciprocal: false }), old: '0001', by: '0002', wantCode: 'SUPERSEDE-NO-RECIPROCAL' })

    // ── ③ 两把副本刀（不碰生产文件）──────────────────────────────────────────────
    /** 副本树的**模块闭包** —— 入口（`.tools/决议-check.mjs`）在**模块加载时**静态 import 的每一份，
     *  除入口自己（它由 patches 版代替）：
     *    · `.tools/lib/决议-ledger.mjs` —— 头块切分 / `INDEX` 派生那一份解析面；
     *    · `presets/agenia/lib/atomic.mjs` —— 写盘走共享原子写（`writeFileAtomic`；`MF-1` 接走之后新增的这一份）。
     *  两份都只 import `node:*`（`fs` / `path` / `url` / `crypto`）⇒ **闭包到它们为止，没有第四份**；
     *  这条结论由 `assertSandboxClosed()` 每次现量，不靠这句话自证。
     *  ⚠️ 少铺一份 = 副本子进程 `ERR_MODULE_NOT_FOUND` —— 那是"刀没跑起来"，读数却与"刀没咬住"同形。 */
    const SANDBOX_MODULES = ['.tools/lib/决议-ledger.mjs', 'presets/agenia/lib/atomic.mjs']

    /**
     * 现量一棵副本树的闭包：从副本入口走一遍 `from '<相对路径>'`，**每一份**都必须落在副本树里，
     * 而且走到的集合必须**恰好**是 `[入口, ...SANDBOX_MODULES]`。
     *  · 缺一份 ⇒ 抛（`DEC09-KNIFE-ANCHOR`：刀装不起来）；
     *  · 多一份（入口又 import 了没登记的东西）⇒ 也抛 —— 否则下一次同样会死在加载上，
     *    而这一次的读数会像"刀咬了"。
     * @returns {string[]} 走到的相对路径（排序；进 `readings`，刀的证据里要能看见闭包是什么）
     */
    const assertSandboxClosed = (dir) => {
      const entry = '.tools/决议-check.mjs'
      const seen = new Set()
      const queue = [entry]
      while (queue.length > 0) {
        const rel = queue.shift()
        if (seen.has(rel)) continue
        seen.add(rel)
        let src = null
        try {
          src = readFileSync(path.join(dir, rel), 'utf8')
        } catch (err) {
          throw new Error(`DEC09-KNIFE-ANCHOR：副本树里缺 ${rel}（${String(err?.code ?? err)}）—— `
            + '入口模块加载时就要它，这一格会以 ERR_MODULE_NOT_FOUND 死掉，读数与"刀咬了"分不开')
        }
        for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/gu)) {
          queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])))
        }
      }
      const expected = new Set([entry, ...SANDBOX_MODULES])
      const missing = [...expected].filter((rel) => !seen.has(rel))
      const extra = [...seen].filter((rel) => !expected.has(rel))
      if (missing.length > 0 || extra.length > 0) {
        throw new Error('DEC09-KNIFE-ANCHOR：副本树的模块闭包与登记对不上（'
          + `入口 import 到 ${JSON.stringify([...seen].sort())}，登记的是 ${JSON.stringify([...expected].sort())}）`
          + ' —— 入口每多 / 少 import 一份，`SANDBOX_MODULES` 与这里就要同批改')
      }
      return [...seen].sort()
    }

    /** 把写手复制到运行根里、按 patches 改一行；返回副本入口路径。
     *  ⚠️ 副本必须保持 `.tools/决议-check.mjs` 的形状：入口只在
     *  `process.argv[1] === <repo>/.tools/决议-check.mjs` 时才跑 `main()`（与生产同一份判法）。
     *  其余模块按 `SANDBOX_MODULES` 逐份铺进来 —— 副本树**自足**，加载期一个字节都不向仓库要。 */
    const copyWriter = (tag, patches) => {
      const dir = sceneRoot('DEC-09', `knife-${tag}`)
      const toolsDir = path.join(dir, '.tools')
      mkdirSync(path.join(toolsDir, 'lib'), { recursive: true })
      let text = readFileSync(CHECK, 'utf8')
      for (const [from, to] of patches) {
        const hits = text.split(from).length - 1
        if (hits !== 1) throw new Error(`DEC09-KNIFE-ANCHOR：锚点在 ${CHECK} 里出现 ${hits} 次（要恰好 1 次）：${from.slice(0, 80)}`)
        text = text.replace(from, to)
      }
      writeFileSync(path.join(toolsDir, '决议-check.mjs'), text, 'utf8')
      for (const rel of SANDBOX_MODULES) {
        const dst = path.join(dir, rel)
        mkdirSync(path.dirname(dst), { recursive: true })
        writeFileSync(dst, readFileSync(path.join(PATHS.repo, rel), 'utf8'), 'utf8')
      }
      rec.readings[`knife_${tag}_closure`] = assertSandboxClosed(dir)
      return path.join(toolsDir, '决议-check.mjs')
    }
    try {
      // K1：把"翻状态"那一行改回去（写手照样 exit 0）⇒ 夹具必须看见 status 没翻
      const k1 = copyWriter('k1', [['next[statusAt] = withEol(`状态: 已废`)', 'next[statusAt] = withEol(`状态: 生效`)']])
      const k1Scene = goodLedger({ caseId: 'DEC-09', tag: 'knife-k1-run', ...pair() })
      const k1File = path.join(k1Scene.root, OLD_FILE)
      const k1Before = readText(k1File)
      const k1Run = summarize(runNode([k1, `--root=${k1Scene.root}`, '--json', '--op=supersede', '0001', '--by=0002']), 'DEC-09/knife-k1')
      const k1After = readText(k1File)
      const k1Reading = supersedeFlipReading(k1Before, k1After, '0002')
      rec.readings.knife_k1 = { exit: k1Run.exit, written: k1Run.json?.written ?? null, reading: k1Reading }
      if (k1Run.exit !== 0 || k1Run.json?.written !== true) {
        push('DEC09-KNIFE-DEAD', `[刀 K1] 把"翻状态"改回去之后写手没有 exit 0/written —— 刀没咬住（实得 exit=${k1Run.exit} written=${JSON.stringify(k1Run.json?.written)}）`)
      } else if (k1Reading.status_line !== null && /已废/u.test(k1Reading.status_line)) {
        push('DEC09-KNIFE-DEAD', `[刀 K1] 写手少了"翻状态"这一步，夹具却仍读到 \`${k1Reading.status_line}\` —— 那这一格判不出"只翻两个字段"`)
      }
      // K2：摘掉正文闸 + 写的时候少一个换行 ⇒ 工具自报"正文没变"，夹具量到变了
      //     锚点是**共享写手那一行** `writeFileAtomic(target, nextText)`（写盘从手搓 `writeFileSync(tmp, …)`
      //     接走之后就是这一行）。判据侧不钉在别人会改的函数字节上：那一行改形，这把刀**同批**跟着改
      //     （`cand-20261106-0140`）。锚点出现次数不是 1 ⇒ `copyWriter` 当场 `DEC09-KNIFE-ANCHOR`。
      const k2 = copyWriter('k2', [
        ['if (out.body_sha256.before !== out.body_sha256.after) {', 'if (false) {'],
        ['writeFileAtomic(target, nextText)', "writeFileAtomic(target, nextText.replace(/\\n$/, ''))"],
      ])
      const k2Scene = goodLedger({ caseId: 'DEC-09', tag: 'knife-k2-run', ...pair() })
      const k2File = path.join(k2Scene.root, OLD_FILE)
      const k2Before = readText(k2File)
      const k2Run = summarize(runNode([k2, `--root=${k2Scene.root}`, '--json', '--op=supersede', '0001', '--by=0002']), 'DEC-09/knife-k2')
      const k2After = readText(k2File)
      const k2Reading = supersedeFlipReading(k2Before, k2After, '0002')
      rec.readings.knife_k2 = {
        exit: k2Run.exit, written: k2Run.json?.written ?? null,
        tool_self_report: k2Run.json?.body_sha256 ?? null,
        fixture: k2Reading.body_sha256,
      }
      if (k2Run.exit !== 0 || k2Run.json?.written !== true) {
        push('DEC09-KNIFE-DEAD', `[刀 K2] 摘掉正文闸之后写手没有 exit 0/written —— 刀没咬住（实得 exit=${k2Run.exit}）`)
      } else if (k2Reading.body_sha256.before === k2Reading.body_sha256.after) {
        push('DEC09-KNIFE-DEAD', '[刀 K2] 写的时候少了一个换行，夹具量到的正文 sha 却没变 —— 那这一格的"正文 sha 不变"是空话')
      } else if (JSON.stringify(k2Run.json?.body_sha256?.before) !== JSON.stringify(k2Run.json?.body_sha256?.after)) {
        push('DEC09-KNIFE-DEAD', `[刀 K2] 工具自报也跟着变了（${JSON.stringify(k2Run.json?.body_sha256)}）—— 那这把刀证明不了"自报不可信、夹具才可信"`)
      }
    } catch (err) {
      push('DEC09-KNIFE-ANCHOR', `[刀] 副本刀没做成：${String(err?.message ?? err)}`)
    }

    caseFail(problems)
  })
})
