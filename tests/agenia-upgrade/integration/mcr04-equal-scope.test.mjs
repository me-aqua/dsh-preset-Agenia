/**
 * `MCR-04` · **`F-170`** —— `equal` 只覆盖 **CODE 集**：这句边界必须住在**读数旁边**。
 * `MCR-06` · **`bug-20261107-03`** —— 往副本里多放一个文件 ⇒ **必须红**；刀：抽掉那一条 ⇒ 同一输入变绿。
 *
 * 病根（技术评审 2026-11-06 `F5` / 定形 §一 #4/#7）：
 *   `equal` 量的是 **CODE 集**的指纹；`__pycache__/` 与 `*.pyc` 在**排除表**里（2026-11-03 `R3-4` 加进去的），
 *   所以往副本里写一个 `.pyc`，两次 CODE 指纹一模一样。**"副本还是不是派工那一刻那份"这句话**，
 *   对**多出来的文件**是瞎的。修法两条，**互不替代**（组长拍死：**不扩** `equal` 到全树）：
 *     · **#4（这一格）**：读数里、`equal` 旁边，必须有那句边界 —— 读的人不必去翻决定书；
 *     · **#7（这一格）**：多出来的文件由**另一格**判（`E_COPY_HAS_EXTRA`），并且**产品那条路**
 *       （`--verify`）必须非零、`is_that_commit.ok:false`、报文点名那一份。
 *
 * `MCR-04` 判四格：
 *   ① **前提**：副本里有一个 `__pycache__/*.pyc` 时，`--verify` 的 `equal` **仍然是 true**
 *      （如果它变成 false，说明有人扩了 `equal` 的口径 —— 与组长的决定相反，这一格要重新定形，不许静默改）；
 *   ② **边界句是产品自己说的**（2026-11-07 评审 `M3`）：`--verify` 的 JSON 里、与 `equal` **同一份**，
 *      必须有 `equal_scope`：`covers` 点 CODE、`does_not_cover` 至少有一条点名"多出来的文件"、
 *      至少有一条说清"被排除表挡掉 / CODE 集之外"。测试侧**不再另写一份**（`equalScopeReading()` 已删）；
 *      刀打在**产品的 emit** 上（拷导出器、把 `equal_scope` 键改名）⇒ 同一个 `--verify` 没有这一格 ⇒ ② 红。
 *   ③ **同格另一条腿**：`copyIntegrityVerdict()` 必须 `ok:false` + `E_COPY_HAS_EXTRA` 并点名那份 `.pyc`；
 *      抽掉"多出来的文件"这一条腿（`checkExtra:false`）⇒ 同一份副本必须变绿（退化刀）；
 *   ④ **不是空样本**：把 `.pyc` 搬走 ⇒ `equal:true` + 完整性 `ok:true`（这一格两边都翻得动）。
 *
 * `MCR-06` 判三格（**产品那条路**）：
 *   ① 有 `.pyc` ⇒ `--verify` 非零、`ok:false`、`is_that_commit.ok:false`、`problems` 点名 `__pycache__/probe.pyc`；
 *   ② 删掉 `.pyc` ⇒ `--verify` 回到 0 / `equal:true` / `is_that_commit.ok:true`（阳性对照，不是永远红）；
 *   ③ **刀**：把导出器拷进运行根、只把"副本多一份"那一行关掉 ⇒ 同一输入必须 `exit 0`（= ① 会红）。
 *
 * 🔴 覆盖边界（这两格**不判**什么）：
 *   · 不判 `__pycache__` 该不该进排除表（那是 `fingerprint.mjs` 的名单；这一格拿它当**已知的边界**）；
 *   · 不判"副本被改了内容"（那是 `is_that_commit` 的 `mismatched` 那一支 / `REV-05`）；
 *   · 不判 `equal` 与 `is_that_commit` 谁该负责红 —— 这一格只要求**两件事都在读数里**、且**各有各的码/句**。
 */
import { before, describe, test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PATHS } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, runRoot } from '../support/evidence.mjs'
import {
  buildFixtureRepo, codeDigestOfCommit, copyIntegrityVerdict, exporterPath,
  runExport, runVerify,
} from '../support/tree-at-commit.mjs'

before(() => {
  preflight()
})

/** 把一个提交导出成副本（产品那条路）；失败时返回 `null` 并把原因交给调用方点名。 */
function exportCopy({ root, exporter, fx, label }) {
  const out = path.join(root, 'fixtures', `mcr-${label}-copy`)
  const exp = runExport({ exporter: exporter.file, repo: fx.repo, commit: fx.commitA, out })
  return { out, exp }
}

describe('integration · measuring/copy (MCR) · F-170 equal 的覆盖边界', () => {
  test('MCR-04 读数里 equal 旁边有"只覆盖 CODE 集、不覆盖多出来的文件"那句边界（刀：抽掉完整性那一条腿）', async () => {
    await runCase('MCR-04', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      const root = runRoot()
      const ex = exporterPath()
      rec.readings.exporter = { file: ex.file, exists: ex.exists, source: ex.source }
      if (!ex.exists) {
        push('EXPORTER-MISSING', `导出器不在：${ex.file} —— 没有 \`--verify\` 的读数，这一格判不了"equal 旁边有什么"`)
        caseFail(problems)
        return
      }

      // ── 夹具：干净副本 ⇒ 加一个 .pyc ⇒ 再删掉 ────────────────────────────────
      const fx = buildFixtureRepo(root, 'mcr04')
      rec.readings.fixture = { repo: fx.repo, commit: fx.commitA }
      const { out, exp } = exportCopy({ root, exporter: ex, fx, label: 'mcr04' })
      rec.readings.export = { out, exit: exp.exit, ok: exp.json?.ok ?? null, code: exp.json?.code ?? null }
      if (exp.exit !== 0 || exp.json === null) {
        push('EXPORT-FAILED', `夹具副本没导出来（exit=${exp.exit}）：${String(exp.stderr ?? '').trim().slice(0, 240)}`)
        caseFail(problems)
        return
      }
      const expect = String(exp.json.code?.sha256 ?? '')
      const commitDigest = codeDigestOfCommit(fx.repo, fx.commitA)
      rec.readings.commit_code = { ok: commitDigest.ok, sha256: commitDigest.sha256 }
      const verifyClean = runVerify({ exporter: ex.file, copy: out, repo: fx.repo, commit: fx.commitA, expect })
      rec.readings.verify_clean = { exit: verifyClean.exit, equal: verifyClean.json?.equal ?? null, ok: verifyClean.json?.ok ?? null }

      // ── 往副本里多放一个文件（**在排除表里**的那一种：`.pyc`）────────────────────
      const pycDir = path.join(out, '__pycache__')
      mkdirSync(pycDir, { recursive: true })
      const pycRel = '__pycache__/probe.pyc'
      writeFileSync(path.join(out, pycRel), 'MCR-04 探针：一个 106941 B 量级的 .pyc 的替身\n', 'utf8')
      const verifyExtra = runVerify({ exporter: ex.file, copy: out, repo: fx.repo, commit: fx.commitA, expect })
      const v = verifyExtra.json ?? {}
      const extraIntegrity = copyIntegrityVerdict({ repo: fx.repo, commit: fx.commitA, copyRoot: out })
      const withoutExtra = copyIntegrityVerdict({ repo: fx.repo, commit: fx.commitA, copyRoot: out, checkExtra: false })

      /**
       * 🔴 **边界句住在 `equal` 旁边，而且它是产品自己说的**（`F-170`；2026-11-07 评审 `M3`）：
       * `--verify` 的 JSON 现在自己 emit `equal_scope`（`{covers, does_not_cover}`）。
       * ⇒ 这一格**只断言产品那一格**（`v.equal_scope`），测试侧不再另写一份（`equalScopeReading()` 已删）：
       *   一份事实两个载体，改一处就是没改（`cand-20261104-0020`）。
       */
      const scope = v.equal_scope ?? null
      rec.readings.verify = {
        copy: out,
        expect,
        equal_clean: verifyClean.json?.equal ?? null,
        /** 同一个对象里的 `equal`：这一格量的是"有 .pyc 时它还是不是 true"。 */
        equal: v.equal ?? null,
        /** 产品 emit 的那一句，原样抄进来（**不在测试侧重写**）—— 读 `result.json` 的人在这里看到它。 */
        equal_scope: scope,
        product: {
          exit: verifyExtra.exit,
          ok: v.ok ?? null,
          is_that_commit_ok: v.is_that_commit?.ok ?? null,
          problems: (v.is_that_commit?.problems ?? []).slice(0, 5),
          equal_scope_present: 'equal_scope' in v,
          equal_present: 'equal' in v,
        },
        copy_integrity: extraIntegrity,
        copy_integrity_without_extra_leg: withoutExtra,
      }

      // ① 前提：`equal` 仍然是 true（口径**没有**被扩到全树）
      if (rec.readings.verify.equal !== true) {
        push('EQUAL-PREMISE-CHANGED', `有 \`${pycRel}\` 时 \`--verify\` 的 \`equal\` = ${JSON.stringify(rec.readings.verify.equal)}（期望 true）—— 这说明有人把 \`equal\` 的口径扩到了 CODE 集之外，与定形 §一 #4 的决定相反：这一格要重新定形，不许静默扩`)
      }
      if (verifyClean.json?.equal !== true) push('EQUAL-PREMISE-CHANGED', `干净副本的 \`equal\` 就不是 true（${JSON.stringify(verifyClean.json?.equal ?? null)}）—— 后面的"有 .pyc 时仍 true"没有对照`)

      // ② 边界句：**产品的** `equal_scope` 必须与 `equal` 同住一份 JSON，且三样都在
      //    （covers 点 CODE / does_not_cover 点名多出来的文件 / 它讲清了"CODE 集之外"）
      if (!('equal_scope' in v)) {
        push('EQUAL-SCOPE-MISSING', `\`--verify\` 的 JSON 里没有 \`equal_scope\`（有 \`equal\`=${JSON.stringify(v.equal ?? null)}）—— 读 \`equal:true\` 的人没有任何一句告诉他这数只覆盖 CODE 集`)
      } else if (scope === null || typeof scope !== 'object' || Array.isArray(scope)) {
        push('EQUAL-SCOPE-MISSING', `\`equal_scope\` 不是对象：${JSON.stringify(scope)?.slice(0, 200)}`)
      } else {
        if (typeof scope.covers !== 'string' || !/code/i.test(scope.covers)) {
          push('EQUAL-SCOPE-MISSING', `\`equal_scope.covers\` 没有点名 CODE 集：${JSON.stringify(scope.covers)}`)
        }
        const dnc = Array.isArray(scope.does_not_cover) ? scope.does_not_cover.map(String) : []
        if (dnc.length === 0) {
          push('EQUAL-SCOPE-MISSING', `\`equal_scope.does_not_cover\` 不是非空数组：${JSON.stringify(scope.does_not_cover)} —— "只覆盖 CODE 集"必须同句说清**不覆盖**什么`)
        } else {
          if (!dnc.some((s) => /extra/i.test(s))) push('EQUAL-SCOPE-MISSING', `\`equal_scope.does_not_cover\` 没有一条点名"多出来的文件"：${JSON.stringify(dnc)}`)
          if (!dnc.some((s) => /__pycache__|exclusion/i.test(s))) push('EQUAL-SCOPE-MISSING', `\`equal_scope.does_not_cover\` 没有一条说清"被排除表挡掉的文件"：${JSON.stringify(dnc)}`)
        }
      }

      // ③ 同格另一条腿：完整性判定必须红 + 有码；抽掉那一条腿 ⇒ 同一输入必须绿
      if (extraIntegrity.ok !== false) push('COPY-INTEGRITY-BLIND', `副本里多了 \`${pycRel}\`，\`copyIntegrityVerdict()\` 却 ok=true —— "equal 只覆盖 CODE 集"这句话于是没有第二条腿兜底（多出来的文件谁都不判）`)
      if (extraIntegrity.code !== 'E_COPY_HAS_EXTRA') push('COPY-INTEGRITY-CODE', `多出来文件的红因码应是 \`E_COPY_HAS_EXTRA\`，实得 ${JSON.stringify(extraIntegrity.code)}`)
      if (!(extraIntegrity.extra ?? []).includes(pycRel)) push('COPY-INTEGRITY-NAME', `完整性判定没有点名 \`${pycRel}\`：${JSON.stringify(extraIntegrity.extra)}`)
      if (withoutExtra.ok !== true) push('KNIFE-NO-BITE', '把"多出来的文件"这一条腿抽掉（`checkExtra:false`）之后，同一份副本仍然 ok=false —— 这一刀没咬到那一条腿（①③ 的翻面证据不成立）')

      // ③b **刀打在产品的 emit 上**（评审 `M3`）：拷一份导出器，只把 `equal_scope` 那个键改名 ⇒
      //     同一个 `--verify` 的 JSON 里就**没有** `equal_scope` ⇒ ② 必须红（而 `equal` 仍是 true，
      //     证明这一刀只动了"边界句"那一格，没有把整个读数弄坏）。
      {
        const knifeDir = path.join(root, 'fixtures', 'mcr04-knife')
        mkdirSync(knifeDir, { recursive: true })
        const knifeTool = path.join(knifeDir, 'tree-at-commit.mjs')
        copyFileSync(ex.file, knifeTool)
        copyFileSync(path.join(path.dirname(ex.file), 'fingerprint.mjs'), path.join(knifeDir, 'fingerprint.mjs'))
        const src = readFileSync(knifeTool, 'utf8')
        const anchor = '    equal_scope: {'
        const hits = src.split(anchor).length - 1
        if (hits !== 1) {
          push('KNIFE-ANCHOR', `退化刀的锚点 "${anchor}" 在导出器里命中 ${hits} 处（应恰好 1 处）—— 刀钝了：把边界句从 emit 里摘掉也不会红`)
          rec.readings.equal_scope_knife = { anchor, anchor_hits: hits }
        } else {
          writeFileSync(knifeTool, src.split(anchor).join('    equal_scope_disabled: {'), 'utf8')
          const knifed = runVerify({ exporter: knifeTool, copy: out, repo: fx.repo, commit: fx.commitA, expect })
          const kj = knifed.json ?? {}
          rec.readings.equal_scope_knife = {
            anchor, anchor_hits: hits, exit: knifed.exit,
            equal: kj.equal ?? null,
            equal_scope_present: 'equal_scope' in kj,
            equal_scope_disabled_present: 'equal_scope_disabled' in kj,
          }
          if ('equal_scope' in kj) {
            push('KNIFE-NO-BITE', `把 emit 里 \`equal_scope\` 那个键改名之后，\`--verify\` 的 JSON 里**仍然有** \`equal_scope\` ⇒ 这一刀没咬到边界句（② 的翻面证据不成立）`)
          }
          if (kj.equal !== true) {
            push('KNIFE-NO-BITE', `边界句那把刀把 \`equal\` 也弄坏了（${JSON.stringify(kj.equal ?? null)}）—— 刀砍宽了：它应当只动 \`equal_scope\` 那一格`)
          }
        }
      }

      // ④ 删掉 .pyc ⇒ 两边都绿（这一格不是空样本）
      // ⚠️ **用改名搬走、不用 `rmSync`**：`ENV-02` 的 `DELETE-NO-MARKER` 明令测试里不许裸删
      //    （契约 §2.5：先解析 → 校验 marker → 校验在 RUN_ID 之下）。搬走的那一份就是还原的凭据
      //    （与 `support/min-runtime.mjs::quarantineRuntime` 同一条纪律）。
      renameSync(pycDir, path.join(root, 'fixtures', 'mcr04-pyc-quarantined'))
      const verifyRestored = runVerify({ exporter: ex.file, copy: out, repo: fx.repo, commit: fx.commitA, expect })
      const restoredIntegrity = copyIntegrityVerdict({ repo: fx.repo, commit: fx.commitA, copyRoot: out })
      rec.readings.verify.restored = {
        equal: verifyRestored.json?.equal ?? null,
        exit: verifyRestored.exit,
        integrity_ok: restoredIntegrity.ok,
      }
      if (verifyRestored.json?.equal !== true) push('EQUAL-RESTORE', `删掉 \`.pyc\` 之后 \`equal\` 不是 true（${JSON.stringify(verifyRestored.json?.equal ?? null)}）—— 这一格的输入没有回到干净态`)
      if (restoredIntegrity.ok !== true) push('EQUAL-RESTORE', `删掉 \`.pyc\` 之后完整性判定仍 ok=false（${restoredIntegrity.code ?? '(无码)'}）—— 这一格不是"有 .pyc 才红"`)

      // 读数旁的那句话再核一次：**同一份 result.json 里**能读到的搜串（"说某句话在"也要贴搜串）
      rec.readings.equal_boundary_search = {
        file_note: 'result.json → readings.verify.equal_scope（**产品的**字段，原样抄）',
        searched: ['equal_scope', 'CODE', 'extra', '__pycache__|exclusion'],
        hits: {
          product_equal_scope: 'equal_scope' in v,
          covers_has_code: typeof scope?.covers === 'string' && /code/i.test(scope.covers),
          dnc_has_extra: Array.isArray(scope?.does_not_cover) && scope.does_not_cover.map(String).some((s) => /extra/i.test(s)),
          dnc_has_exclusion: Array.isArray(scope?.does_not_cover) && scope.does_not_cover.map(String).some((s) => /__pycache__|exclusion/i.test(s)),
        },
      }

      caseFail(problems)
    })
  })
})

describe('integration · measuring/copy (MCR) · bug-20261107-03 多一个文件必须红', () => {
  test('MCR-06 副本里多一个 .pyc ⇒ --verify 必须非零且点名它；刀：关掉"多一份"那一条 ⇒ 同一输入 exit 0', async () => {
    await runCase('MCR-06', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      const root = runRoot()
      const ex = exporterPath()
      rec.readings.exporter = { file: ex.file, exists: ex.exists, source: ex.source }
      if (!ex.exists) {
        push('EXPORTER-MISSING', `导出器不在：${ex.file} —— 这一格判不了"多一个文件会不会红"`)
        caseFail(problems)
        return
      }
      const fx = buildFixtureRepo(root, 'mcr06')
      rec.readings.fixture = { repo: fx.repo, commit: fx.commitA }
      const { out, exp } = exportCopy({ root, exporter: ex, fx, label: 'mcr06' })
      if (exp.exit !== 0 || exp.json === null) {
        push('EXPORT-FAILED', `夹具副本没导出来（exit=${exp.exit}）：${String(exp.stderr ?? '').trim().slice(0, 240)}`)
        caseFail(problems)
        return
      }
      const expect = String(exp.json.code?.sha256 ?? '')
      const pycRel = '__pycache__/probe.pyc'
      const pycAbs = path.join(out, pycRel)
      mkdirSync(path.dirname(pycAbs), { recursive: true })
      writeFileSync(pycAbs, 'MCR-06 探针\n', 'utf8')

      // ① 有 .pyc ⇒ 产品那条路必须红，并点名它
      const extraRun = runVerify({ exporter: ex.file, copy: out, repo: fx.repo, commit: fx.commitA, expect })
      const j = extraRun.json ?? {}
      const shown = (j.is_that_commit?.problems ?? []).map(String)
      rec.readings.extra = {
        copy: out, pyc: pycRel, exit: extraRun.exit,
        equal: j.equal ?? null, ok: j.ok ?? null,
        is_that_commit_ok: j.is_that_commit?.ok ?? null,
        problems: shown.slice(0, 5),
        names_pyc: shown.some((p) => p.includes(pycRel)),
        stderr: String(extraRun.stderr ?? '').slice(-400),
      }
      if (extraRun.exit === 0) {
        push('VERIFY-EXTRA-ACCEPTED', `副本里多了 \`${pycRel}\`，\`--verify\` 竟然 exit 0 —— "副本还是派工那一刻那份"这句话对多出来的文件是瞎的`)
      }
      if (j.is_that_commit?.ok !== false) {
        push('VERIFY-EXTRA-IGNORED', `多了 \`${pycRel}\`，\`is_that_commit.ok\` 却是 ${JSON.stringify(j.is_that_commit?.ok)}（期望 false）—— 路径集合那一腿没看见它`)
      }
      if (!shown.some((p) => p.includes(pycRel))) {
        push('VERIFY-EXTRA-UNNAMED', `红了，但没有一条 problem 点名 \`${pycRel}\`：${JSON.stringify(shown.slice(0, 4))} —— 读的人不知道该删哪一份`)
      }

      // ② 删掉 ⇒ 回到 0 / equal:true / is_that_commit.ok:true（阳性对照）
      //    ⚠️ 同样用改名搬走（`ENV-02` 的 `DELETE-NO-MARKER`）。
      renameSync(path.dirname(pycAbs), path.join(root, 'fixtures', 'mcr06-pyc-quarantined'))
      const cleanRun = runVerify({ exporter: ex.file, copy: out, repo: fx.repo, commit: fx.commitA, expect })
      rec.readings.clean = {
        exit: cleanRun.exit, equal: cleanRun.json?.equal ?? null,
        ok: cleanRun.json?.ok ?? null, is_that_commit_ok: cleanRun.json?.is_that_commit?.ok ?? null,
      }
      if (cleanRun.exit !== 0 || cleanRun.json?.equal !== true || cleanRun.json?.is_that_commit?.ok !== true) {
        push('VERIFY-RESTORE', `删掉 \`.pyc\` 之后应当回到 exit 0 / equal:true / is_that_commit.ok:true，实得 exit=${cleanRun.exit} / equal=${JSON.stringify(cleanRun.json?.equal ?? null)} / is_that_commit.ok=${JSON.stringify(cleanRun.json?.is_that_commit?.ok ?? null)}`)
      }

      // ③ 刀：拷一份导出器，把"副本多一份"那一行关掉 ⇒ 同一输入必须 exit 0
      const knifeDir = path.join(root, 'fixtures', 'mcr06-knife')
      mkdirSync(knifeDir, { recursive: true })
      const knifeTool = path.join(knifeDir, 'tree-at-commit.mjs')
      const knifeFingerprint = path.join(knifeDir, 'fingerprint.mjs')
      copyFileSync(ex.file, knifeTool)
      copyFileSync(path.join(path.dirname(ex.file), 'fingerprint.mjs'), knifeFingerprint)
      const src = readFileSync(knifeTool, 'utf8')
      const anchor = 'problems.push(`副本多一份（副本里有、提交里没有）：' + '${rel}`)'
      const hits = src.split(anchor).length - 1
      const patched = src.split(anchor).join('if (false) ' + anchor)
      writeFileSync(knifeTool, patched, 'utf8')
      let knife = { file: knifeTool, anchor, anchor_hits: hits, exit: null, equal: null, ok: null }
      if (hits !== 1) {
        push('KNIFE-ANCHOR', `退化刀的锚点在导出器里命中 ${hits} 处（应恰好 1 处）—— 刀钝了：关掉"多一份"那一条不会红`)
      } else {
        // 重新把 .pyc 放回去（② 删掉了）
        mkdirSync(path.dirname(pycAbs), { recursive: true })
        writeFileSync(pycAbs, 'MCR-06 探针（刀）\n', 'utf8')
        const knifed = runVerify({ exporter: knifeTool, copy: out, repo: fx.repo, commit: fx.commitA, expect })
        knife = { file: knifeTool, anchor, anchor_hits: hits, exit: knifed.exit, equal: knifed.json?.equal ?? null, ok: knifed.json?.ok ?? null }
        if (knifed.exit === 0) {
          if (knifed.json?.ok !== true) push('KNIFE-NO-BITE', `关掉"多一份"那一条之后 exit 0，但读数 \`ok\` 不是 true（${JSON.stringify(knifed.json?.ok)}）—— 拦住它的还有另一条，这一刀没咬到那一条`)
        } else {
          push('KNIFE-NO-BITE', `关掉"多一份"那一条之后，同一个输入仍然 exit=${knifed.exit} / ${JSON.stringify(knifed.json?.ok ?? null)} —— 说明拦住它的不是这一条（①② 的绿不是它给的）`)
        }
        // 还原成干净副本（搬走，不删；这一跑之后不再用）
        renameSync(path.dirname(pycAbs), path.join(root, 'fixtures', 'mcr06-pyc-quarantined-knife'))
      }
      rec.readings.knife = knife

      caseFail(problems)
    })
  })
})
