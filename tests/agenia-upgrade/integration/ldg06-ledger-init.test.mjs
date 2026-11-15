/**
 * `LDG-06` —— **缺账本必红**：有 `.team/`、无 `账本/` ⇒ `LEDGER-NOT-INITIALISED`（构案 0012 §②-8）。
 *
 * 契约：`.team/test/2026-11-15/CONTRACT-0012.md`（§1.1 · §9.1 · §10.1 `--op init` · §11 K13）。
 *
 * 这条是 RealisticAccessories 那件事的根治：一个工区连跑两天没建账本、**没有任何机制拦**。
 * 所以判据要两半都在：**缺就红**（K13）+ **`--op init` 建出来的骨架必须当场绿**（否则红没法消）。
 *
 * 🔴 **今天的预期是红**：检查器不在盘上 ⇒ `TOOL-MISSING`。
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { before, test } from 'node:test'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import {
  BOOKS, CHECK, INDEX_RELS, LEDGER_REL, buildScene, codesOf, expectCodes, messagesOf, namedIn,
  runCheck, runInit, toolPresent, treeDigest,
} from '../support/three-books.mjs'

before(() => {
  preflight()
})

// ── LDG-06 ──────────────────────────────────────────────────────────────
test('LDG-06 缺账本必红：有 .team/ 无 账本/ ⇒ LEDGER-NOT-INITIALISED；--op init 建骨架后当场绿', async () => {
  await runCase('LDG-06', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    if (!toolPresent(problems, CHECK, '契约 §1.1 的检查器（缺账本这一条只能由它判）')) {
      caseFail(problems)
      return
    }

    // ① 夹具工区：有 `.team/`（连卡片抽屉都建好了）、没有 `账本/` ⇒ 红 + 具名码
    {
      const scene = buildScene({ caseId: 'LDG-06', tag: 'no-ledger', team: true, withLedger: false })
      const run = runCheck(scene.root)
      rec.readings.no_ledger = {
        root: scene.root,
        ledger_present: existsSync(path.join(scene.root, LEDGER_REL)),
        exit: run.exit,
        codes: codesOf(run.json),
        messages: messagesOf(run.json).map((m) => m.slice(0, 240)),
      }
      if (existsSync(path.join(scene.root, LEDGER_REL))) {
        push('FIXTURE-BROKEN', '[LDG-06/no-ledger] 夹具自己把 账本/ 建出来了 —— 这一格的对象没了')
      }
      if (expectCodes(problems, run, ['LEDGER-NOT-INITIALISED'], push, { label: 'LDG-06/no-ledger' })) {
        if (!namedIn(run.json, LEDGER_REL)) push('NOT-NAMED', '[LDG-06/no-ledger] 报文必须点名缺的那个目录 `账本`')
        if (!namedIn(run.json, scene.root)) push('NOT-NAMED', '[LDG-06/no-ledger] 报文必须点名是哪个根（否则人不知道该去哪儿建）')
      }
    }
    // ② `--op init` 建三册 + 三张派生页 ⇒ 六个落点都在盘上
    {
      const scene = buildScene({ caseId: 'LDG-06', tag: 'init', team: true, withLedger: false })
      const init = runInit(scene.root)
      const want = [...BOOKS.map((b) => `${LEDGER_REL}/${b}`), ...INDEX_RELS.map((p) => `${LEDGER_REL}/${p}`)]
      const missing = want.filter((rel) => !existsSync(path.join(scene.root, rel)))
      rec.readings.init = {
        root: scene.root,
        exit: init.exit,
        codes: codesOf(init.json),
        created: init.json?.created ?? null,
        missing,
      }
      if (init.json === null) {
        push('JSON-UNPARSEABLE', `[LDG-06/init] --op init 的 --json 解析不了（${init.json_error}）· stdout 头=${JSON.stringify(init.stdout_head)}`)
      } else if (init.exit !== 0 || init.json.ok !== true) {
        push('INIT-NOT-OK', `[LDG-06/init] --op init 没有成功：exit=${init.exit} ok=${JSON.stringify(init.json.ok)} 码集=${JSON.stringify(codesOf(init.json))}`)
      }
      if (missing.length > 0) push('INIT-INCOMPLETE', `[LDG-06/init] 这六个落点没建出来：${JSON.stringify(missing)}（契约 §10.1：init = 三册骨架 + 三张派生页）`)
    }
    // ③ init 之后必须当场绿；再 init 一次不许改写（幂等：树哈希不变）
    {
      const scene = buildScene({ caseId: 'LDG-06', tag: 'init-twice', team: true, withLedger: false })
      runInit(scene.root)
      const after1 = treeDigest(scene.root)
      const run1 = runCheck(scene.root)
      const init2 = runInit(scene.root)
      const after2 = treeDigest(scene.root)
      const run2 = runCheck(scene.root)
      rec.readings.init_twice = {
        root: scene.root,
        check_after_init: { exit: run1.exit, codes: codesOf(run1.json), messages: messagesOf(run1.json).map((m) => m.slice(0, 240)) },
        second_init: { exit: init2.exit, codes: codesOf(init2.json) },
        digest_1: after1.digest,
        digest_2: after2.digest,
        check_after_second: { exit: run2.exit, codes: codesOf(run2.json) },
      }
      expectCodes(problems, run1, [], push, { label: 'LDG-06/init-twice · 第一次 init 之后' })
      if (init2.exit !== 0) push('INIT-NOT-IDEMPOTENT', `[LDG-06/init-twice] 第二次 --op init 退出码 ${init2.exit}（码集 ${JSON.stringify(codesOf(init2.json))}）—— 已建好的骨架不该被拒，也不该被改写`)
      if (after1.digest !== after2.digest) {
        push('INIT-NOT-IDEMPOTENT', `[LDG-06/init-twice] 第二次 init 改了树（${after1.digest.slice(0, 16)} → ${after2.digest.slice(0, 16)}）—— 骨架已在该什么都不做`)
      }
      expectCodes(problems, run2, [], push, { label: 'LDG-06/init-twice · 第二次 init 之后' })
    }

    caseFail(problems)
  })
})
